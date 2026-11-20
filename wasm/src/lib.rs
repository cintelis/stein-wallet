//! Stein Chain wallet core.
//!
//! Everything a wallet must get byte-exact lives here, in Rust, and is
//! compiled to WebAssembly: deriving a key from a seed, deriving and checking
//! addresses, encoding and signing a transfer, and signing and verifying a
//! statement (below). The formats are those of
//! stein-chain (`stein-crypto`, `stein-types`); `tests/` holds vectors made by
//! the chain's own wallet, so a drift from the chain fails the build.
//!
//! Scope: accounts on **FN-DSA-512 per the draft FIPS 206** (scheme tag 3,
//! `fn-dsa-512-draft`). ML-DSA accounts need the chain's AWS-LC, which does
//! not target the browser.
//!
//! A **statement** is a signature that is not a transaction: proof, to a web
//! site, that the holder of an account wrote something. It is signed over
//! `"STEIN-STATEMENT-v1" ‖ kind ‖ payload`, which no transaction's signed
//! bytes can equal (those start `"STEIN-SIG-v1"`), so a statement can never
//! be replayed as a transfer, nor a transfer as a statement.
//!
//! The module has no access to randomness of its own. The caller passes 32
//! fresh random bytes with each signature (in a browser, from
//! `crypto.getRandomValues`).

#![forbid(unsafe_op_in_unsafe_fn)]

use fn_dsa::{
    sign_key_size, signature_size, vrfy_key_size, KeyPairGenerator, KeyPairGenerator512,
    SigningKey as _, SigningKey512, VerifyingKey as _, VerifyingKey512, DOMAIN_NONE,
    FN_DSA_LOGN_512, HASH_ID_RAW,
};
use rand_core::{CryptoRng, RngCore};
use zeroize::Zeroize;

pub mod ffi;

/// Length of a key seed.
pub const SEED_LEN: usize = 32;
/// On-chain tag of FN-DSA-512 per the draft FIPS 206.
pub const SCHEME_TAG: u8 = 3;
/// Name of the scheme in seed files and JSON.
pub const SCHEME_NAME: &str = "fn-dsa-512-draft";
/// Encoded public key length.
pub const PUBLIC_KEY_LEN: usize = vrfy_key_size(FN_DSA_LOGN_512);
/// Signature length.
pub const SIGNATURE_LEN: usize = signature_size(FN_DSA_LOGN_512);
/// Length of an address in text form: `st` + 64 hex + 8 hex of checksum.
pub const ADDRESS_TEXT_LEN: usize = 2 + 64 + 8;
/// Encoded length of a transaction body holding a transfer.
pub const BODY_LEN: usize = 1 + 8 + 32 + 8 + 16 + 8 + 1 + 32 + 16;

const KEYGEN_CONTEXT: &str = "stein fn-dsa-512-draft keygen v1";
const ADDRESS_CONTEXT: &str = "stein address v2";
const CHECKSUM_CONTEXT: &str = "stein address checksum v1";
const TXID_CONTEXT: &str = "stein txid v1";
/// Not a chain format: how this wallet stretches the caller's 32 random bytes
/// into the randomness one signature consumes.
const SIGNING_RANDOMNESS_CONTEXT: &str = "stein-wallet signing randomness v1";
const SIGNING_PREFIX: &[u8; 12] = b"STEIN-SIG-v1";
/// What a statement is signed under. Not a chain format: the chain never sees
/// a statement. It must never be a prefix of, or prefixed by, `SIGNING_PREFIX`.
const STATEMENT_PREFIX: &[u8; 18] = b"STEIN-STATEMENT-v1";
const DOMAIN_TRANSACTION: u8 = 1;
const TX_VERSION: u8 = 1;
const ACTION_TRANSFER: u8 = 0;

/// Why an operation failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    /// The FN-DSA library refused the operation.
    Crypto,
    /// An address does not start with `st`.
    AddressPrefix,
    /// An address is not `st` followed by 72 hex characters.
    AddressFormat,
    /// An address's checksum does not match: almost certainly a typo.
    AddressChecksum,
    /// A transfer of zero.
    ZeroAmount,
    /// The fee does not fit in 128 bits.
    FeeOverflow,
}

/// BLAKE3 in derive-key mode, read as an extendable output.
struct XofRng(blake3::OutputReader);

impl XofRng {
    fn new(context: &str, input: &[u8]) -> Self {
        let mut hasher = blake3::Hasher::new_derive_key(context);
        hasher.update(input);
        Self(hasher.finalize_xof())
    }
}

impl RngCore for XofRng {
    fn next_u32(&mut self) -> u32 {
        let mut b = [0u8; 4];
        self.0.fill(&mut b);
        u32::from_le_bytes(b)
    }
    fn next_u64(&mut self) -> u64 {
        let mut b = [0u8; 8];
        self.0.fill(&mut b);
        u64::from_le_bytes(b)
    }
    fn fill_bytes(&mut self, dest: &mut [u8]) {
        self.0.fill(dest);
    }
    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), rand_core::Error> {
        self.0.fill(dest);
        Ok(())
    }
}

impl CryptoRng for XofRng {}

fn hash(context: &str, parts: &[&[u8]]) -> [u8; 32] {
    let mut hasher = blake3::Hasher::new_derive_key(context);
    for part in parts {
        hasher.update(part);
    }
    *hasher.finalize().as_bytes()
}

/// A key pair derived from a seed.
pub struct Key {
    signing: Box<SigningKey512>,
    public: Vec<u8>,
}

impl Key {
    /// The key pair of `seed`, exactly as stein-chain derives it.
    ///
    /// Needs several megabytes of stack: see `.cargo/config.toml` for
    /// WebAssembly, and run it on a large-stack thread natively.
    pub fn from_seed(seed: &[u8; SEED_LEN]) -> Result<Self, Error> {
        let mut rng = XofRng::new(KEYGEN_CONTEXT, seed);
        let mut secret = vec![0u8; sign_key_size(FN_DSA_LOGN_512)];
        let mut public = vec![0u8; PUBLIC_KEY_LEN];
        KeyPairGenerator512::default().keygen(FN_DSA_LOGN_512, &mut rng, &mut secret, &mut public);
        let signing = SigningKey512::decode(&secret).map(Box::new);
        secret.zeroize();
        Ok(Self {
            signing: signing.ok_or(Error::Crypto)?,
            public,
        })
    }

    /// The encoded public key, without its scheme tag.
    pub fn public_key(&self) -> &[u8] {
        &self.public
    }

    /// The address this key controls.
    pub fn address(&self) -> [u8; 32] {
        hash(ADDRESS_CONTEXT, &[&[SCHEME_TAG], &self.public])
    }

    /// Signs a transaction body. `randomness` must be fresh for every call.
    fn sign_body(&mut self, body: &[u8], randomness: &[u8; 32]) -> Result<Vec<u8>, Error> {
        let mut message = Vec::with_capacity(SIGNING_PREFIX.len() + 1 + body.len());
        message.extend_from_slice(SIGNING_PREFIX);
        message.push(DOMAIN_TRANSACTION);
        message.extend_from_slice(body);
        self.sign_message(&message, randomness)
    }

    /// Signs a statement of the given kind. `randomness` must be fresh for
    /// every call. What a kind and its payload mean is up to the site that
    /// asks for it; the wallet shows the user what they are signing.
    pub fn sign_statement(
        &mut self,
        kind: u8,
        payload: &[u8],
        randomness: &[u8; 32],
    ) -> Result<Vec<u8>, Error> {
        self.sign_message(&statement_message(kind, payload), randomness)
    }

    fn sign_message(&mut self, message: &[u8], randomness: &[u8; 32]) -> Result<Vec<u8>, Error> {
        let mut rng = XofRng::new(SIGNING_RANDOMNESS_CONTEXT, randomness);
        let mut signature = vec![0u8; SIGNATURE_LEN];
        self.signing
            .sign(
                &mut rng,
                &DOMAIN_NONE,
                &HASH_ID_RAW,
                message,
                &mut signature,
            )
            .ok_or(Error::Crypto)?;
        Ok(signature)
    }
}

fn statement_message(kind: u8, payload: &[u8]) -> Vec<u8> {
    let mut message = Vec::with_capacity(STATEMENT_PREFIX.len() + 1 + payload.len());
    message.extend_from_slice(STATEMENT_PREFIX);
    message.push(kind);
    message.extend_from_slice(payload);
    message
}

/// The address an encoded public key controls, if it is a public key.
pub fn address_of(public_key: &[u8]) -> Result<[u8; 32], Error> {
    VerifyingKey512::decode(public_key).ok_or(Error::Crypto)?;
    Ok(hash(ADDRESS_CONTEXT, &[&[SCHEME_TAG], public_key]))
}

/// Whether `signature` is `public_key`'s signature of the statement.
pub fn verify_statement(public_key: &[u8], kind: u8, payload: &[u8], signature: &[u8]) -> bool {
    let Some(key) = VerifyingKey512::decode(public_key) else {
        return false;
    };
    key.verify(
        signature,
        &DOMAIN_NONE,
        &HASH_ID_RAW,
        &statement_message(kind, payload),
    )
}

fn checksum(address: &[u8; 32]) -> [u8; 4] {
    let digest = hash(CHECKSUM_CONTEXT, &[address]);
    [digest[0], digest[1], digest[2], digest[3]]
}

fn hex_digit(n: u8) -> u8 {
    match n {
        0..=9 => b'0' + n,
        _ => b'a' + (n - 10),
    }
}

fn hex_value(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

/// The text form of an address: `st`, the address in hex, then a checksum.
pub fn address_to_text(address: &[u8; 32]) -> String {
    let mut out = String::with_capacity(ADDRESS_TEXT_LEN);
    out.push_str("st");
    for byte in address.iter().chain(checksum(address).iter()) {
        out.push(hex_digit(byte >> 4) as char);
        out.push(hex_digit(byte & 0x0f) as char);
    }
    out
}

/// Parses the text form of an address, checking its checksum.
pub fn address_from_text(text: &str) -> Result<[u8; 32], Error> {
    let body = text.strip_prefix("st").ok_or(Error::AddressPrefix)?;
    let body = body.as_bytes();
    if body.len() != 72 {
        return Err(Error::AddressFormat);
    }
    let mut raw = [0u8; 36];
    let (pairs, _) = body.as_chunks::<2>();
    for (out, [high, low]) in raw.iter_mut().zip(pairs) {
        let high = hex_value(*high).ok_or(Error::AddressFormat)?;
        let low = hex_value(*low).ok_or(Error::AddressFormat)?;
        *out = (high << 4) | low;
    }
    let mut address = [0u8; 32];
    address.copy_from_slice(&raw[..32]);
    if checksum(&address) != raw[32..] {
        return Err(Error::AddressChecksum);
    }
    Ok(address)
}

/// A transfer to sign.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Transfer {
    /// Network the transaction is valid on.
    pub chain_id: u64,
    /// The sender's next nonce.
    pub nonce: u64,
    /// Last height at which the transaction may be included.
    pub expires_at: u64,
    /// The chain's minimum fee per encoded byte, in base units.
    pub min_fee_per_byte: u128,
    /// Recipient.
    pub to: [u8; 32],
    /// Base units to move.
    pub amount: u128,
    /// Attach the public key: required on the sender's first transaction,
    /// refused on every later one.
    pub register_key: bool,
}

/// A signed transfer, ready to submit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignedTransfer {
    /// The transaction id.
    pub id: [u8; 32],
    /// The fee it pays: the chain's minimum for its size.
    pub fee: u128,
    /// The encoded transaction, as `POST /tx` takes it (hex-encoded).
    pub raw: Vec<u8>,
}

fn encode_body(t: &Transfer, sender: &[u8; 32], fee: u128) -> Vec<u8> {
    let mut body = Vec::with_capacity(BODY_LEN);
    body.push(TX_VERSION);
    body.extend_from_slice(&t.chain_id.to_le_bytes());
    body.extend_from_slice(sender);
    body.extend_from_slice(&t.nonce.to_le_bytes());
    body.extend_from_slice(&fee.to_le_bytes());
    body.extend_from_slice(&t.expires_at.to_le_bytes());
    body.push(ACTION_TRANSFER);
    body.extend_from_slice(&t.to);
    body.extend_from_slice(&t.amount.to_le_bytes());
    body
}

/// Encoded size of a transfer: what the fee is measured in.
pub fn transfer_len(register_key: bool) -> usize {
    // body + option tag + key (tagged) + signature (tagged)
    let key = if register_key { 1 + PUBLIC_KEY_LEN } else { 0 };
    BODY_LEN + 1 + key + 1 + SIGNATURE_LEN
}

/// Encodes and signs `transfer` from the account of `key`, paying the minimum
/// fee for its size.
pub fn sign_transfer(
    key: &mut Key,
    transfer: &Transfer,
    randomness: &[u8; 32],
) -> Result<SignedTransfer, Error> {
    if transfer.amount == 0 {
        return Err(Error::ZeroAmount);
    }
    let len = transfer_len(transfer.register_key);
    let fee = transfer
        .min_fee_per_byte
        .checked_mul(len as u128)
        .ok_or(Error::FeeOverflow)?;
    let body = encode_body(transfer, &key.address(), fee);
    let signature = key.sign_body(&body, randomness)?;

    let mut raw = Vec::with_capacity(len);
    raw.extend_from_slice(&body);
    if transfer.register_key {
        raw.push(1);
        raw.push(SCHEME_TAG);
        raw.extend_from_slice(key.public_key());
    } else {
        raw.push(0);
    }
    raw.push(SCHEME_TAG);
    raw.extend_from_slice(&signature);
    debug_assert_eq!(raw.len(), len);
    Ok(SignedTransfer {
        id: hash(TXID_CONTEXT, &[&body]),
        fee,
        raw,
    })
}
