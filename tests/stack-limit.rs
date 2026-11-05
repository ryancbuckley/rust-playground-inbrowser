//! A thread that outgrows its stack, for testing the stack limit check.
//!
//! Wasm has no guard pages, so without the check (release builds) the thread
//! writes over the heap below its stack, and the damage shows up elsewhere:
//! here, as a panic in `join` or as damaged blocks. In debug builds the
//! thread traps instead ("the program trapped (unreachable)") before writing
//! outside its stack, and neither line below is printed.

use std::hint::black_box;
use std::thread;

// Each call keeps a 64 KiB array on the shadow stack: 48 calls need 3 MiB,
// more than a spawned thread's 2 MiB.
fn deep(n: u32) -> u64 {
    let mut a = [0u8; 64 * 1024];
    black_box(&mut a);
    a[0] = n as u8;
    if n == 0 { a[100] as u64 } else { deep(n - 1) + a[0] as u64 }
}

fn main() {
    // Heap data allocated before the thread, so likely below its stack.
    let data: Vec<Vec<u8>> = (0..64).map(|i| vec![i as u8; 64 * 1024]).collect();
    let r = thread::spawn(|| deep(black_box(48))).join();
    println!("thread result: {r:?}");
    let damaged = data.iter().enumerate().filter(|(i, v)| v.iter().any(|&x| x != *i as u8)).count();
    println!("damaged heap blocks: {damaged} of {}", data.len());
}
