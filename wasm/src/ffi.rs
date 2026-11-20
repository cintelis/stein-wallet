//! The WebAssembly interface: plain exported functions over byte buffers in
//! the module's memory. No JavaScript glue is generated; `lib/stein/core.ts`
//! in the app is the only caller.
//!
//! Every function returns 0 or a length on success and a negative code on
//! failure (see [`code`]). Buffers are allocated and freed by the caller with
//! [`stein_alloc`] and [`stein_free`].

use zeroize::Zeroize;

use crate::{
    address_from_text, address_to_text, sign_transfer, Error, Key, Transfer, ADDRESS_TEXT_LEN,
    SEED_LEN,
};

/// Length of the input to [`stein_transfer`].
pub const TRANSFER_INPUT_LEN: usize = 32 + 32 + 8 + 8 + 8 + 16 + 32 + 16 + 1;

fn code(error: Error) -> i32 {
    match error {
        Error::Crypto => -1,
        Error::AddressPrefix => -2,
        Error::AddressFormat => -3,
        Error::AddressChecksum => -4,
        Error::ZeroAmount => -5,
        Error::FeeOverflow => -6,
    }
}

/// The output buffer is too small.
const TOO_SMALL: i32 = -7;

/// Allocates `len` bytes in the module's memory.
#[no_mangle]
pub extern "C" fn stein_alloc(len: usize) -> *mut u8 {
    let mut buffer = vec![0u8; len].into_boxed_slice();
    let ptr = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    ptr
}

/// Wipes and frees a buffer from [`stein_alloc`].
///
/// # Safety
/// `ptr` and `len` must be exactly what one earlier [`stein_alloc`] call
/// returned and was given, and the buffer must not be used afterwards.
#[no_mangle]
pub unsafe extern "C" fn stein_free(ptr: *mut u8, len: usize) {
    if ptr.is_null() {
        return;
    }
    // SAFETY: per the contract above, this is the boxed slice made by
    // `stein_alloc`.
    let mut buffer = unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)) };
    buffer.zeroize();
}

/// Writes the 32-byte address of the key derived from the 32-byte seed.
///
/// # Safety
/// `seed` must point to 32 readable bytes and `out` to 32 writable bytes.
#[no_mangle]
pub unsafe extern "C" fn stein_address_from_seed(seed: *const u8, out: *mut u8) -> i32 {
    // SAFETY: per the contract above.
    let (seed, out) = unsafe {
        (
            &*(seed as *const [u8; SEED_LEN]),
            &mut *(out as *mut [u8; 32]),
        )
    };
    match Key::from_seed(seed) {
        Ok(key) => {
            *out = key.address();
            0
        }
        Err(e) => code(e),
    }
}

/// Writes the 74-character text form of a 32-byte address.
///
/// # Safety
/// `address` must point to 32 readable bytes and `out` to 74 writable bytes.
#[no_mangle]
pub unsafe extern "C" fn stein_address_encode(address: *const u8, out: *mut u8) -> i32 {
    // SAFETY: per the contract above.
    let (address, out) = unsafe {
        (
            &*(address as *const [u8; 32]),
            std::slice::from_raw_parts_mut(out, ADDRESS_TEXT_LEN),
        )
    };
    out.copy_from_slice(address_to_text(address).as_bytes());
    0
}

/// Parses the text form of an address, checking its checksum, and writes the
/// 32-byte address.
///
/// # Safety
/// `text` must point to `len` readable bytes and `out` to 32 writable bytes.
#[no_mangle]
pub unsafe extern "C" fn stein_address_decode(text: *const u8, len: usize, out: *mut u8) -> i32 {
    // SAFETY: per the contract above.
    let (text, out) = unsafe {
        (
            std::slice::from_raw_parts(text, len),
            &mut *(out as *mut [u8; 32]),
        )
    };
    let Ok(text) = std::str::from_utf8(text) else {
        return code(Error::AddressFormat);
    };
    match address_from_text(text) {
        Ok(address) => {
            *out = address;
            0
        }
        Err(e) => code(e),
    }
}

fn u64_at(input: &[u8], at: usize) -> u64 {
    let mut b = [0u8; 8];
    b.copy_from_slice(&input[at..at + 8]);
    u64::from_le_bytes(b)
}

fn u128_at(input: &[u8], at: usize) -> u128 {
    let mut b = [0u8; 16];
    b.copy_from_slice(&input[at..at + 16]);
    u128::from_le_bytes(b)
}

/// Signs a transfer.
///
/// Input, [`TRANSFER_INPUT_LEN`] bytes, integers little-endian:
/// `seed[32] ‖ randomness[32] ‖ chain_id u64 ‖ nonce u64 ‖ expires_at u64 ‖
/// min_fee_per_byte u128 ‖ to[32] ‖ amount u128 ‖ register_key u8`.
///
/// Output: `txid[32] ‖ fee u128 ‖ transaction`. Returns its length.
///
/// # Safety
/// `input` must point to [`TRANSFER_INPUT_LEN`] readable bytes and `out` to
/// `out_cap` writable bytes.
#[no_mangle]
pub unsafe extern "C" fn stein_transfer(input: *const u8, out: *mut u8, out_cap: usize) -> i32 {
    // SAFETY: per the contract above.
    let (input, out) = unsafe {
        (
            std::slice::from_raw_parts(input, TRANSFER_INPUT_LEN),
            std::slice::from_raw_parts_mut(out, out_cap),
        )
    };
    let mut seed = [0u8; SEED_LEN];
    seed.copy_from_slice(&input[..32]);
    let mut randomness = [0u8; 32];
    randomness.copy_from_slice(&input[32..64]);
    let mut to = [0u8; 32];
    to.copy_from_slice(&input[104..136]);
    let transfer = Transfer {
        chain_id: u64_at(input, 64),
        nonce: u64_at(input, 72),
        expires_at: u64_at(input, 80),
        min_fee_per_byte: u128_at(input, 88),
        to,
        amount: u128_at(input, 136),
        register_key: input[152] != 0,
    };

    let signed =
        Key::from_seed(&seed).and_then(|mut key| sign_transfer(&mut key, &transfer, &randomness));
    seed.zeroize();
    randomness.zeroize();
    let signed = match signed {
        Ok(signed) => signed,
        Err(e) => return code(e),
    };
    let len = 32 + 16 + signed.raw.len();
    if out.len() < len {
        return TOO_SMALL;
    }
    out[..32].copy_from_slice(&signed.id);
    out[32..48].copy_from_slice(&signed.fee.to_le_bytes());
    out[48..len].copy_from_slice(&signed.raw);
    len as i32
}
