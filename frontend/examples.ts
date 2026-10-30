// Programs to try, for the Examples menu: what runs in the browser.

export const EXAMPLES: { name: string; description: string; code: string }[] = [
  {
    name: 'Hello, world',
    description: 'Print a line.',
    code: `fn main() {
    println!("Hello from Rust, compiled in your browser!");
}
`,
  },
  {
    name: 'Threads',
    description: 'Threads (std::thread), each in its own web worker, sharing memory.',
    code: `use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let total = Arc::new(Mutex::new(0u64));
    let handles: Vec<_> = (1..=4)
        .map(|id| {
            let total = Arc::clone(&total);
            thread::spawn(move || {
                let sum: u64 = (0..1_000_000u64).filter(|n| n % id == 0).sum();
                *total.lock().unwrap() += sum;
                println!("thread {id} summed {sum}");
                sum
            })
        })
        .collect();
    let sums: Vec<u64> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    println!("sums = {sums:?}");
    println!("total = {}", total.lock().unwrap());
}
`,
  },
  {
    name: 'Collections and traits',
    description: 'Enums, traits and the standard collections.',
    code: `use std::collections::BTreeMap;
use std::fmt;

#[derive(Debug, Clone, PartialEq)]
enum Shape {
    Circle { r: f64 },
    Rect { w: f64, h: f64 },
}

impl Shape {
    fn area(&self) -> f64 {
        match self {
            Shape::Circle { r } => std::f64::consts::PI * r * r,
            Shape::Rect { w, h } => w * h,
        }
    }
}

impl fmt::Display for Shape {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?} with area {:.2}", self, self.area())
    }
}

fn main() {
    let shapes = vec![
        Shape::Circle { r: 1.5 },
        Shape::Rect { w: 2.0, h: 3.5 },
        Shape::Circle { r: 0.5 },
    ];
    let mut by_kind: BTreeMap<&str, Vec<&Shape>> = BTreeMap::new();
    for s in &shapes {
        let kind = match s { Shape::Circle { .. } => "circle", Shape::Rect { .. } => "rect" };
        by_kind.entry(kind).or_default().push(s);
    }
    for (kind, list) in &by_kind {
        let total: f64 = list.iter().map(|s| s.area()).sum();
        println!("{kind}: {} shapes, total area {total:.2}", list.len());
        for s in list {
            println!("  {s}");
        }
    }
    let mut words: Vec<String> = "the quick brown fox jumps over the lazy dog"
        .split(' ')
        .map(str::to_uppercase)
        .collect();
    words.sort();
    words.dedup();
    println!("{}", words.join(", "));
}
`,
  },
  {
    name: 'Random',
    description: 'The rand crate, with randomness from the browser.',
    code: `// The randomness comes from the browser (crypto.getRandomValues).
fn main() {
    let roll: u32 = rand::random_range(1..=6);
    println!("Dice roll: {roll}");

    let x: f64 = rand::random();
    println!("Random float in [0, 1): {x}");
}
`,
  },
  {
    name: 'Panic',
    description: 'What a panic looks like.',
    code: `fn main() {
    let v = vec![1, 2, 3];
    let i = v.len() + 2;
    println!("about to index {i}");
    println!("{}", v[i]);
}
`,
  },
];
