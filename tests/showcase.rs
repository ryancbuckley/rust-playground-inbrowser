//! A tour of Rust in one file, for stress-testing the playground.
//!
//! Each section prints what it computed and checks itself where it can:
//! "ok" lines should never say "FAILED". The pictures (ray tracer,
//! Mandelbrot, Game of Life, maze) are deterministic, so they should look the
//! same everywhere. Uses std plus the playground's serde_json, regex,
//! itertools and tokio.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;

static CHECKS: AtomicUsize = AtomicUsize::new(0);
static FAILURES: AtomicUsize = AtomicUsize::new(0);

/// Record a self-check and print it.
pub fn check(what: &str, ok: bool) {
    CHECKS.fetch_add(1, Ordering::Relaxed);
    if ok {
        println!("  ok: {what}");
    } else {
        FAILURES.fetch_add(1, Ordering::Relaxed);
        println!("  FAILED: {what}");
    }
}

fn main() {
    let sections: Vec<(&str, fn())> = vec![
        ("A small Lisp", lisp::run),
        ("Ray tracer", raytrace::run),
        ("Mandelbrot set", mandelbrot::run),
        ("Big integers", bigint::run),
        ("Game of Life", life::run),
        ("Maze", maze::run),
        ("Sudoku", sudoku::run),
        ("Primes, on four threads", primes::run),
        ("Sorting", sorting::run),
        ("JSON", json::run),
        ("Text", text::run),
        ("Huffman coding", huffman::run),
        ("Matrices with const generics", matrix::run),
        ("Traits, iterators, errors and macros", traits::run),
        ("Brainfuck", brainfuck::run),
        ("Async tasks with tokio", async_tasks::run),
    ];
    let start = Instant::now();
    for (i, (name, section)) in sections.iter().enumerate() {
        println!("\n=== {}. {name} ===", i + 1);
        let t = Instant::now();
        section();
        println!("  ({:.0} ms)", t.elapsed().as_secs_f64() * 1000.0);
    }
    println!(
        "\n{} sections, {} checks, {} failed, in {:.2} s.",
        sections.len(),
        CHECKS.load(Ordering::Relaxed),
        FAILURES.load(Ordering::Relaxed),
        start.elapsed().as_secs_f64()
    );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

mod util {
    /// A small, deterministic random number generator (xorshift64).
    #[derive(Clone)]
    pub struct XorShift(u64);

    impl XorShift {
        pub fn new(seed: u64) -> Self {
            XorShift(seed.max(1))
        }

        pub fn next_u64(&mut self) -> u64 {
            let mut x = self.0;
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            self.0 = x;
            x
        }

        /// A number in `0..n`.
        pub fn below(&mut self, n: usize) -> usize {
            (self.next_u64() % n as u64) as usize
        }
    }

    impl Iterator for XorShift {
        type Item = u64;
        fn next(&mut self) -> Option<u64> {
            Some(self.next_u64())
        }
    }

    pub const GETTYSBURG: &str = "Four score and seven years ago our fathers brought forth on this \
        continent, a new nation, conceived in Liberty, and dedicated to the proposition that all \
        men are created equal. Now we are engaged in a great civil war, testing whether that \
        nation, or any nation so conceived and so dedicated, can long endure. We are met on a \
        great battle-field of that war. We have come to dedicate a portion of that field, as a \
        final resting place for those who here gave their lives that that nation might live. It \
        is altogether fitting and proper that we should do this. But, in a larger sense, we can \
        not dedicate -- we can not consecrate -- we can not hallow -- this ground. The brave men, \
        living and dead, who struggled here, have consecrated it, far above our poor power to add \
        or detract. The world will little note, nor long remember what we say here, but it can \
        never forget what they did here. It is for us the living, rather, to be dedicated here to \
        the unfinished work which they who fought here have thus far so nobly advanced. It is \
        rather for us to be here dedicated to the great task remaining before us -- that from \
        these honored dead we take increased devotion to that cause for which they gave the last \
        full measure of devotion -- that we here highly resolve that these dead shall not have \
        died in vain -- that this nation, under God, shall have a new birth of freedom -- and that \
        government of the people, by the people, for the people, shall not perish from the earth.";
}

// ---------------------------------------------------------------------------
// 1. A small Lisp: enums, Rc<RefCell<..>>, recursion, closures, errors
// ---------------------------------------------------------------------------

mod lisp {
    use super::check;
    use std::cell::RefCell;
    use std::collections::HashMap;
    use std::fmt;
    use std::rc::Rc;

    type Builtin = fn(&[Value]) -> Result<Value, String>;
    type Env = Rc<RefCell<Scope>>;

    #[derive(Clone)]
    pub enum Value {
        Nil,
        Bool(bool),
        Int(i64),
        Sym(Rc<str>),
        Str(Rc<str>),
        List(Rc<Vec<Value>>),
        Builtin(&'static str, Builtin),
        Lambda(Rc<Lambda>),
    }

    pub struct Lambda {
        params: Vec<Rc<str>>,
        body: Rc<Vec<Value>>,
        env: Env,
    }

    pub struct Scope {
        vars: HashMap<Rc<str>, Value>,
        parent: Option<Env>,
    }

    impl Scope {
        fn new(parent: Option<Env>) -> Env {
            Rc::new(RefCell::new(Scope { vars: HashMap::new(), parent }))
        }
    }

    impl fmt::Display for Value {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            match self {
                Value::Nil => write!(f, "()"),
                Value::Bool(b) => write!(f, "{}", if *b { "#t" } else { "#f" }),
                Value::Int(n) => write!(f, "{n}"),
                Value::Sym(s) => write!(f, "{s}"),
                Value::Str(s) => write!(f, "{s:?}"),
                Value::List(items) => {
                    write!(f, "(")?;
                    for (i, item) in items.iter().enumerate() {
                        if i > 0 {
                            write!(f, " ")?;
                        }
                        write!(f, "{item}")?;
                    }
                    write!(f, ")")
                }
                Value::Builtin(name, _) => write!(f, "#<builtin {name}>"),
                Value::Lambda(l) => write!(f, "#<lambda/{}>", l.params.len()),
            }
        }
    }

    fn tokenize(src: &str) -> Vec<String> {
        let mut tokens = Vec::new();
        let mut chars = src.chars().peekable();
        while let Some(&c) = chars.peek() {
            match c {
                c if c.is_whitespace() => {
                    chars.next();
                }
                ';' => {
                    for c in chars.by_ref() {
                        if c == '\n' {
                            break;
                        }
                    }
                }
                '(' | ')' | '\'' => {
                    tokens.push(c.to_string());
                    chars.next();
                }
                '"' => {
                    chars.next();
                    let mut s = String::from("\"");
                    for c in chars.by_ref() {
                        if c == '"' {
                            break;
                        }
                        s.push(c);
                    }
                    tokens.push(s);
                }
                _ => {
                    let mut s = String::new();
                    while let Some(&c) = chars.peek() {
                        if c.is_whitespace() || c == '(' || c == ')' {
                            break;
                        }
                        s.push(c);
                        chars.next();
                    }
                    tokens.push(s);
                }
            }
        }
        tokens
    }

    fn parse(tokens: &[String], pos: &mut usize) -> Result<Value, String> {
        let token = tokens.get(*pos).ok_or("unexpected end of input")?;
        *pos += 1;
        match token.as_str() {
            "(" => {
                let mut items = Vec::new();
                loop {
                    match tokens.get(*pos).map(String::as_str) {
                        None => return Err("missing )".into()),
                        Some(")") => {
                            *pos += 1;
                            break;
                        }
                        Some(_) => items.push(parse(tokens, pos)?),
                    }
                }
                Ok(make_list(items))
            }
            ")" => Err("unexpected )".into()),
            "'" => Ok(make_list(vec![Value::Sym("quote".into()), parse(tokens, pos)?])),
            "#t" => Ok(Value::Bool(true)),
            "#f" => Ok(Value::Bool(false)),
            t if t.starts_with('"') => Ok(Value::Str(t[1..].into())),
            t => Ok(t.parse::<i64>().map(Value::Int).unwrap_or_else(|_| Value::Sym(t.into()))),
        }
    }

    fn make_list(items: Vec<Value>) -> Value {
        if items.is_empty() { Value::Nil } else { Value::List(Rc::new(items)) }
    }

    fn truthy(v: &Value) -> bool {
        !matches!(v, Value::Bool(false) | Value::Nil)
    }

    fn int(v: &Value) -> Result<i64, String> {
        match v {
            Value::Int(n) => Ok(*n),
            other => Err(format!("not a number: {other}")),
        }
    }

    fn symbol(v: &Value) -> Result<Rc<str>, String> {
        match v {
            Value::Sym(s) => Ok(s.clone()),
            other => Err(format!("not a symbol: {other}")),
        }
    }

    fn list_items(v: &Value) -> Result<&[Value], String> {
        match v {
            Value::Nil => Ok(&[]),
            Value::List(items) => Ok(items),
            other => Err(format!("not a list: {other}")),
        }
    }

    fn arith(args: &[Value], op: fn(i64, i64) -> Option<i64>, name: &str) -> Result<Value, String> {
        let mut it = args.iter();
        let mut acc = int(it.next().ok_or(format!("{name} needs arguments"))?)?;
        for a in it {
            acc = op(acc, int(a)?).ok_or(format!("{name}: overflow or division by zero"))?;
        }
        Ok(Value::Int(acc))
    }

    fn compare(args: &[Value], op: fn(&i64, &i64) -> bool) -> Result<Value, String> {
        let nums = args.iter().map(int).collect::<Result<Vec<_>, _>>()?;
        Ok(Value::Bool(nums.windows(2).all(|w| op(&w[0], &w[1]))))
    }

    fn global_env() -> Env {
        let env = Scope::new(None);
        let builtins: &[(&'static str, Builtin)] = &[
            ("+", |a| arith(a, i64::checked_add, "+")),
            ("-", |a| {
                if a.len() == 1 { Ok(Value::Int(-int(&a[0])?)) } else { arith(a, i64::checked_sub, "-") }
            }),
            ("*", |a| arith(a, i64::checked_mul, "*")),
            ("/", |a| arith(a, i64::checked_div, "/")),
            ("%", |a| arith(a, i64::checked_rem, "%")),
            ("=", |a| compare(a, i64::eq)),
            ("<", |a| compare(a, i64::lt)),
            (">", |a| compare(a, i64::gt)),
            ("<=", |a| compare(a, i64::le)),
            (">=", |a| compare(a, i64::ge)),
            ("not", |a| Ok(Value::Bool(!truthy(&a[0])))),
            ("list", |a| Ok(make_list(a.to_vec()))),
            ("cons", |a| {
                let mut items = vec![a[0].clone()];
                items.extend_from_slice(list_items(&a[1])?);
                Ok(make_list(items))
            }),
            ("car", |a| list_items(&a[0])?.first().cloned().ok_or_else(|| "car of empty list".to_string())),
            ("cdr", |a| {
                let items = list_items(&a[0])?;
                if items.is_empty() { Err("cdr of empty list".into()) } else { Ok(make_list(items[1..].to_vec())) }
            }),
            ("null?", |a| Ok(Value::Bool(list_items(&a[0]).map(|l| l.is_empty()).unwrap_or(false)))),
            ("length", |a| Ok(Value::Int(list_items(&a[0])?.len() as i64))),
        ];
        for &(name, f) in builtins {
            env.borrow_mut().vars.insert(name.into(), Value::Builtin(name, f));
        }
        env
    }

    fn lookup(env: &Env, name: &str) -> Result<Value, String> {
        let scope = env.borrow();
        match scope.vars.get(name) {
            Some(v) => Ok(v.clone()),
            None => match &scope.parent {
                Some(parent) => lookup(parent, name),
                None => Err(format!("unbound symbol: {name}")),
            },
        }
    }

    fn set(env: &Env, name: &str, value: Value) -> Result<(), String> {
        let mut scope = env.borrow_mut();
        if let Some(slot) = scope.vars.get_mut(name) {
            *slot = value;
            return Ok(());
        }
        match scope.parent.clone() {
            Some(parent) => {
                drop(scope);
                set(&parent, name, value)
            }
            None => Err(format!("set! of unbound symbol: {name}")),
        }
    }

    fn lambda(params: &[Value], body: &[Value], env: &Env) -> Result<Value, String> {
        Ok(Value::Lambda(Rc::new(Lambda {
            params: params.iter().map(symbol).collect::<Result<_, _>>()?,
            body: Rc::new(body.to_vec()),
            env: env.clone(),
        })))
    }

    fn eval_body(body: &[Value], env: &Env) -> Result<Value, String> {
        let mut last = Value::Nil;
        for expr in body {
            last = eval(expr, env)?;
        }
        Ok(last)
    }

    pub fn eval(x: &Value, env: &Env) -> Result<Value, String> {
        let items = match x {
            Value::Sym(name) => return lookup(env, name),
            Value::List(items) => items,
            other => return Ok(other.clone()),
        };
        if let Value::Sym(head) = &items[0] {
            match &**head {
                "quote" => return Ok(items[1].clone()),
                "if" => {
                    let branch = if truthy(&eval(&items[1], env)?) { items.get(2) } else { items.get(3) };
                    return match branch {
                        Some(b) => eval(b, env),
                        None => Ok(Value::Nil),
                    };
                }
                "define" => {
                    let (name, value) = match &items[1] {
                        Value::Sym(name) => (name.clone(), eval(&items[2], env)?),
                        Value::List(sig) => (symbol(&sig[0])?, lambda(&sig[1..], &items[2..], env)?),
                        other => return Err(format!("cannot define {other}")),
                    };
                    env.borrow_mut().vars.insert(name, value);
                    return Ok(Value::Nil);
                }
                "lambda" => return lambda(list_items(&items[1])?, &items[2..], env),
                "let" => {
                    let scope = Scope::new(Some(env.clone()));
                    for binding in list_items(&items[1])? {
                        let pair = list_items(binding)?;
                        let value = eval(&pair[1], env)?;
                        scope.borrow_mut().vars.insert(symbol(&pair[0])?, value);
                    }
                    return eval_body(&items[2..], &scope);
                }
                "begin" => return eval_body(&items[1..], env),
                "set!" => {
                    let value = eval(&items[2], env)?;
                    set(env, &symbol(&items[1])?, value)?;
                    return Ok(Value::Nil);
                }
                "and" => {
                    let mut last = Value::Bool(true);
                    for e in &items[1..] {
                        last = eval(e, env)?;
                        if !truthy(&last) {
                            break;
                        }
                    }
                    return Ok(last);
                }
                "or" => {
                    let mut last = Value::Bool(false);
                    for e in &items[1..] {
                        last = eval(e, env)?;
                        if truthy(&last) {
                            break;
                        }
                    }
                    return Ok(last);
                }
                "cond" => {
                    for clause in &items[1..] {
                        let c = list_items(clause)?;
                        let is_else = matches!(&c[0], Value::Sym(s) if &**s == "else");
                        if is_else || truthy(&eval(&c[0], env)?) {
                            return eval_body(&c[1..], env);
                        }
                    }
                    return Ok(Value::Nil);
                }
                _ => {}
            }
        }
        let f = eval(&items[0], env)?;
        let args = items[1..].iter().map(|a| eval(a, env)).collect::<Result<Vec<_>, _>>()?;
        apply(&f, &args)
    }

    pub fn apply(f: &Value, args: &[Value]) -> Result<Value, String> {
        match f {
            Value::Builtin(_, func) => func(args),
            Value::Lambda(l) => {
                if l.params.len() != args.len() {
                    return Err(format!("expected {} arguments, got {}", l.params.len(), args.len()));
                }
                let scope = Scope::new(Some(l.env.clone()));
                for (p, a) in l.params.iter().zip(args) {
                    scope.borrow_mut().vars.insert(p.clone(), a.clone());
                }
                eval_body(&l.body, &scope)
            }
            other => Err(format!("not a function: {other}")),
        }
    }

    /// Evaluate every expression in `src`, returning the last result.
    pub fn run_source(src: &str, env: &Env) -> Result<Value, String> {
        let tokens = tokenize(src);
        let mut pos = 0;
        let mut last = Value::Nil;
        while pos < tokens.len() {
            let expr = parse(&tokens, &mut pos)?;
            last = eval(&expr, env)?;
        }
        Ok(last)
    }

    pub fn run() {
        let env = global_env();
        let definitions = "
            (define (fact n) (if (= n 0) 1 (* n (fact (- n 1)))))
            (define (fib n) (if (< n 2) n (+ (fib (- n 1)) (fib (- n 2)))))
            (define (range a b) (if (>= a b) '() (cons a (range (+ a 1) b))))
            (define (map f xs) (if (null? xs) '() (cons (f (car xs)) (map f (cdr xs)))))
            (define (filter p xs)
              (cond ((null? xs) '())
                    ((p (car xs)) (cons (car xs) (filter p (cdr xs))))
                    (else (filter p (cdr xs)))))
            (define (foldl f acc xs) (if (null? xs) acc (foldl f (f acc (car xs)) (cdr xs))))
            (define (make-counter) (let ((n 0)) (lambda () (set! n (+ n 1)) n)))
            (define tick (make-counter))
            (define (compose f g) (lambda (x) (f (g x))))
            (define (ack m n)
              (cond ((= m 0) (+ n 1))
                    ((= n 0) (ack (- m 1) 1))
                    (else (ack (- m 1) (ack m (- n 1))))))
            (define (reverse xs) (foldl (lambda (acc x) (cons x acc)) '() xs))
        ";
        if let Err(e) = run_source(definitions, &env) {
            println!("  error in the definitions: {e}");
        }
        let cases = [
            ("(fact 20)", "2432902008176640000"),
            ("(fib 20)", "6765"),
            ("(map (lambda (x) (* x x)) (filter (lambda (x) (= (% x 3) 0)) (range 1 20)))", "(9 36 81 144 225 324)"),
            ("(foldl + 0 (range 1 51))", "1275"),
            ("(begin (tick) (tick) (tick))", "3"),
            ("((compose (lambda (x) (* x 2)) (lambda (x) (+ x 1))) 20)", "42"),
            ("(ack 2 3)", "9"),
            ("(reverse (list 1 2 3 4 5))", "(5 4 3 2 1)"),
            ("(and (< 1 2) (> 3 2) \"both\")", "\"both\""),
            ("(length (range 0 40))", "40"),
            ("(car '())", "error: car of empty list"),
            ("(undefined-thing 1)", "error: unbound symbol: undefined-thing"),
            ("(fact 30)", "error: *: overflow or division by zero"),
        ];
        let mut all_ok = true;
        for (src, expected) in cases {
            let got = match run_source(src, &env) {
                Ok(v) => v.to_string(),
                Err(e) => format!("error: {e}"),
            };
            println!("  lisp> {src}\n        {got}");
            all_ok &= got == expected;
        }
        check("every expression gives the expected result", all_ok);
    }
}

// ---------------------------------------------------------------------------
// 2. Ray tracer: operator overloading, trait objects, floating point
// ---------------------------------------------------------------------------

mod raytrace {
    use std::ops::{Add, Mul, Neg, Sub};

    #[derive(Clone, Copy, Debug, PartialEq)]
    pub struct V3 {
        pub x: f64,
        pub y: f64,
        pub z: f64,
    }

    pub const fn v3(x: f64, y: f64, z: f64) -> V3 {
        V3 { x, y, z }
    }

    impl Add for V3 {
        type Output = V3;
        fn add(self, o: V3) -> V3 {
            v3(self.x + o.x, self.y + o.y, self.z + o.z)
        }
    }

    impl Sub for V3 {
        type Output = V3;
        fn sub(self, o: V3) -> V3 {
            v3(self.x - o.x, self.y - o.y, self.z - o.z)
        }
    }

    impl Mul<f64> for V3 {
        type Output = V3;
        fn mul(self, k: f64) -> V3 {
            v3(self.x * k, self.y * k, self.z * k)
        }
    }

    impl Neg for V3 {
        type Output = V3;
        fn neg(self) -> V3 {
            v3(-self.x, -self.y, -self.z)
        }
    }

    impl V3 {
        fn dot(self, o: V3) -> f64 {
            self.x * o.x + self.y * o.y + self.z * o.z
        }
        fn len(self) -> f64 {
            self.dot(self).sqrt()
        }
        fn norm(self) -> V3 {
            self * (1.0 / self.len())
        }
        fn reflect(self, normal: V3) -> V3 {
            self - normal * (2.0 * self.dot(normal))
        }
    }

    struct Ray {
        origin: V3,
        dir: V3,
    }

    impl Ray {
        fn at(&self, t: f64) -> V3 {
            self.origin + self.dir * t
        }
    }

    #[derive(Clone, Copy)]
    struct Material {
        brightness: f64,
        reflect: f64,
        checker: bool,
    }

    struct Hit {
        t: f64,
        point: V3,
        normal: V3,
        material: Material,
    }

    trait Shape {
        fn hit(&self, ray: &Ray, t_min: f64) -> Option<Hit>;
    }

    struct Sphere {
        center: V3,
        radius: f64,
        material: Material,
    }

    impl Shape for Sphere {
        fn hit(&self, ray: &Ray, t_min: f64) -> Option<Hit> {
            let oc = ray.origin - self.center;
            let b = oc.dot(ray.dir);
            let c = oc.dot(oc) - self.radius * self.radius;
            let disc = b * b - c;
            if disc < 0.0 {
                return None;
            }
            let sq = disc.sqrt();
            let t = [-b - sq, -b + sq].into_iter().find(|&t| t > t_min)?;
            let point = ray.at(t);
            Some(Hit { t, point, normal: (point - self.center).norm(), material: self.material })
        }
    }

    struct Plane {
        y: f64,
        material: Material,
    }

    impl Shape for Plane {
        fn hit(&self, ray: &Ray, t_min: f64) -> Option<Hit> {
            if ray.dir.y.abs() < 1e-9 {
                return None;
            }
            let t = (self.y - ray.origin.y) / ray.dir.y;
            (t > t_min).then(|| {
                let point = ray.at(t);
                Hit { t, point, normal: v3(0.0, 1.0, 0.0), material: self.material }
            })
        }
    }

    struct Scene {
        shapes: Vec<Box<dyn Shape>>,
        lights: Vec<V3>,
    }

    impl Scene {
        fn closest(&self, ray: &Ray) -> Option<Hit> {
            self.shapes.iter().filter_map(|s| s.hit(ray, 1e-6)).min_by(|a, b| a.t.total_cmp(&b.t))
        }

        fn trace(&self, ray: &Ray, depth: u32) -> f64 {
            let Some(hit) = self.closest(ray) else {
                return 0.05 + 0.1 * ray.dir.y.max(0.0);
            };
            let mut brightness = hit.material.brightness;
            if hit.material.checker && ((hit.point.x.floor() + hit.point.z.floor()) as i64).rem_euclid(2) == 0 {
                brightness *= 0.35;
            }
            let mut light = 0.1;
            for &l in &self.lights {
                let to_light = l - hit.point;
                let dist = to_light.len();
                let dir = to_light * (1.0 / dist);
                let shadow = Ray { origin: hit.point + hit.normal * 1e-4, dir };
                if self.closest(&shadow).is_some_and(|h| h.t < dist) {
                    continue;
                }
                light += hit.normal.dot(dir).max(0.0) * 0.6;
                let mut spec = (-dir).reflect(hit.normal).dot(-ray.dir).max(0.0);
                for _ in 0..4 {
                    spec *= spec;
                }
                light += spec * 0.5;
            }
            let mut color = brightness * light;
            if hit.material.reflect > 0.0 && depth < 3 {
                let bounce = Ray { origin: hit.point + hit.normal * 1e-4, dir: ray.dir.reflect(hit.normal).norm() };
                color = color * (1.0 - hit.material.reflect) + self.trace(&bounce, depth + 1) * hit.material.reflect;
            }
            color
        }
    }

    pub fn run() {
        let matte = |brightness| Material { brightness, reflect: 0.0, checker: false };
        let scene = Scene {
            shapes: vec![
                Box::new(Plane { y: -1.0, material: Material { brightness: 1.0, reflect: 0.2, checker: true } }),
                Box::new(Sphere {
                    center: v3(0.0, 0.0, -4.0),
                    radius: 1.0,
                    material: Material { brightness: 0.9, reflect: 0.5, checker: false },
                }),
                Box::new(Sphere { center: v3(-2.2, -0.3, -5.0), radius: 0.7, material: matte(1.0) }),
                Box::new(Sphere { center: v3(1.9, -0.5, -3.2), radius: 0.5, material: matte(0.8) }),
            ],
            lights: vec![v3(-4.0, 5.0, 0.0), v3(5.0, 3.0, -2.0)],
        };
        let ramp: Vec<char> = " .:-=+*#%@".chars().collect();
        let (w, h) = (72, 30);
        let mut total = 0.0;
        for row in 0..h {
            let line: String = (0..w)
                .map(|col| {
                    let x = (col as f64 + 0.5) / w as f64 * 2.0 - 1.0;
                    let y = 1.0 - (row as f64 + 0.5) / h as f64 * 2.0;
                    // Characters are about twice as tall as they are wide.
                    let dir = v3(x * 1.2, y * 0.6, -1.0).norm();
                    let b = scene.trace(&Ray { origin: v3(0.0, 0.3, 0.0), dir }, 0).clamp(0.0, 0.999);
                    total += b;
                    ramp[(b * ramp.len() as f64) as usize]
                })
                .collect();
            println!("  {line}");
        }
        println!("  mean brightness {:.6}", total / (w * h) as f64);
    }
}

// ---------------------------------------------------------------------------
// 3. Mandelbrot set
// ---------------------------------------------------------------------------

mod mandelbrot {
    use super::check;

    pub fn run() {
        let ramp = b" .,-~:;=!*#$";
        let (w, h, max_iter) = (72usize, 24usize, 64usize);
        let mut inside = 0;
        for row in 0..h {
            let mut line = String::with_capacity(w);
            for col in 0..w {
                let c = (col as f64 / w as f64 * 3.0 - 2.2, row as f64 / h as f64 * 2.4 - 1.2);
                let (mut x, mut y, mut i) = (0.0f64, 0.0f64, 0);
                while i < max_iter && x * x + y * y <= 4.0 {
                    (x, y) = (x * x - y * y + c.0, 2.0 * x * y + c.1);
                    i += 1;
                }
                if i == max_iter {
                    inside += 1;
                    line.push('@');
                } else {
                    line.push(ramp[i * (ramp.len() - 1) / max_iter] as char);
                }
            }
            println!("  {line}");
        }
        println!("  {inside} of {} points are in the set", w * h);
        // The set is symmetric about the real axis; this grid is too, row for row.
        check("about a fifth of the points are in the set", (250..450).contains(&inside));
    }
}

// ---------------------------------------------------------------------------
// 4. Big integers: Vec arithmetic, operator traits on references, Display
// ---------------------------------------------------------------------------

mod bigint {
    use super::check;
    use std::fmt;
    use std::ops::{Add, Mul};

    const BASE: u64 = 1_000_000_000;

    /// An unsigned big integer in base 10^9, least significant limb first.
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct BigUint {
        limbs: Vec<u32>,
    }

    impl BigUint {
        pub fn from_u64(mut n: u64) -> Self {
            let mut limbs = Vec::new();
            while n > 0 {
                limbs.push((n % BASE) as u32);
                n /= BASE;
            }
            BigUint { limbs }
        }

        pub fn is_zero(&self) -> bool {
            self.limbs.is_empty()
        }

        fn trim(mut self) -> Self {
            while self.limbs.last() == Some(&0) {
                self.limbs.pop();
            }
            self
        }

        pub fn mul_small(&self, k: u32) -> Self {
            let mut carry = 0u64;
            let mut limbs = Vec::with_capacity(self.limbs.len() + 1);
            for &l in &self.limbs {
                let v = l as u64 * k as u64 + carry;
                limbs.push((v % BASE) as u32);
                carry = v / BASE;
            }
            while carry > 0 {
                limbs.push((carry % BASE) as u32);
                carry /= BASE;
            }
            BigUint { limbs }.trim()
        }

        pub fn pow(&self, mut e: u32) -> Self {
            let mut base = self.clone();
            let mut acc = BigUint::from_u64(1);
            while e > 0 {
                if e & 1 == 1 {
                    acc = &acc * &base;
                }
                base = &base * &base;
                e >>= 1;
            }
            acc
        }

        pub fn factorial(n: u32) -> Self {
            (2..=n).fold(BigUint::from_u64(1), |acc, k| acc.mul_small(k))
        }

        pub fn digit_sum(&self) -> u32 {
            self.to_string().bytes().map(|b| (b - b'0') as u32).sum()
        }
    }

    impl<'a, 'b> Add<&'b BigUint> for &'a BigUint {
        type Output = BigUint;
        fn add(self, o: &'b BigUint) -> BigUint {
            let n = self.limbs.len().max(o.limbs.len());
            let mut limbs = Vec::with_capacity(n + 1);
            let mut carry = 0u64;
            for i in 0..n {
                let v = *self.limbs.get(i).unwrap_or(&0) as u64 + *o.limbs.get(i).unwrap_or(&0) as u64 + carry;
                limbs.push((v % BASE) as u32);
                carry = v / BASE;
            }
            if carry > 0 {
                limbs.push(carry as u32);
            }
            BigUint { limbs }
        }
    }

    impl<'a, 'b> Mul<&'b BigUint> for &'a BigUint {
        type Output = BigUint;
        fn mul(self, o: &'b BigUint) -> BigUint {
            if self.is_zero() || o.is_zero() {
                return BigUint { limbs: Vec::new() };
            }
            let mut acc = vec![0u64; self.limbs.len() + o.limbs.len() + 1];
            for (i, &a) in self.limbs.iter().enumerate() {
                let mut carry = 0u64;
                for (j, &b) in o.limbs.iter().enumerate() {
                    let v = acc[i + j] + a as u64 * b as u64 + carry;
                    acc[i + j] = v % BASE;
                    carry = v / BASE;
                }
                let mut k = i + o.limbs.len();
                while carry > 0 {
                    let v = acc[k] + carry;
                    acc[k] = v % BASE;
                    carry = v / BASE;
                    k += 1;
                }
            }
            BigUint { limbs: acc.into_iter().map(|x| x as u32).collect() }.trim()
        }
    }

    impl fmt::Display for BigUint {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            let Some((last, rest)) = self.limbs.split_last() else {
                return f.pad("0");
            };
            let mut s = last.to_string();
            for limb in rest.iter().rev() {
                s.push_str(&format!("{limb:09}"));
            }
            f.pad(&s)
        }
    }

    fn fibonacci(n: usize) -> BigUint {
        let (mut a, mut b) = (BigUint::from_u64(0), BigUint::from_u64(1));
        for _ in 0..n {
            let next = &a + &b;
            a = std::mem::replace(&mut b, next);
        }
        a
    }

    fn abbreviate(s: &str) -> String {
        if s.len() <= 60 { s.to_string() } else { format!("{}...{} ({} digits)", &s[..30], &s[s.len() - 20..], s.len()) }
    }

    pub fn run() {
        let two = BigUint::from_u64(2);
        let p256 = two.pow(256);
        println!("  2^256  = {p256}");
        check(
            "2^256 is right",
            p256.to_string() == "115792089237316195423570985008687907853269984665640564039457584007913129639936",
        );
        let p1000 = two.pow(1000);
        println!("  2^1000 = {}", abbreviate(&p1000.to_string()));
        check("the digits of 2^1000 add up to 1366", p1000.digit_sum() == 1366);

        let f100 = BigUint::factorial(100);
        check("the digits of 100! add up to 648", f100.digit_sum() == 648);
        let f1000 = BigUint::factorial(1000).to_string();
        println!("  1000!  = {}", abbreviate(&f1000));
        let zeros = f1000.len() - f1000.trim_end_matches('0').len();
        check("1000! has 2568 digits, 249 of them trailing zeros", f1000.len() == 2568 && zeros == 249);

        let fib = fibonacci(1000).to_string();
        println!("  F(1000) = {}", abbreviate(&fib));
        check("F(1000) has 209 digits and starts 4346655768", fib.len() == 209 && fib.starts_with("4346655768"));

        let a = BigUint::from_u64(987_654_321_987_654_321);
        let product = &a * &BigUint::from_u64(12_345);
        let sum = (0..12_345).fold(BigUint::from_u64(0), |acc, _| &acc + &a);
        check("multiplying agrees with adding 12345 times", product == sum);
    }
}

// ---------------------------------------------------------------------------
// 5. Game of Life: iterators, closures, Clone + PartialEq
// ---------------------------------------------------------------------------

mod life {
    use super::check;

    #[derive(Clone, PartialEq)]
    struct Grid {
        w: usize,
        h: usize,
        cells: Vec<bool>,
    }

    impl Grid {
        fn from_pattern(w: usize, h: usize, pattern: &[&str], at: (usize, usize)) -> Grid {
            let mut cells = vec![false; w * h];
            for (dy, row) in pattern.iter().enumerate() {
                for (dx, c) in row.chars().enumerate() {
                    if c == '#' {
                        cells[(at.1 + dy) % h * w + (at.0 + dx) % w] = true;
                    }
                }
            }
            Grid { w, h, cells }
        }

        fn alive(&self, x: isize, y: isize) -> bool {
            let x = x.rem_euclid(self.w as isize) as usize;
            let y = y.rem_euclid(self.h as isize) as usize;
            self.cells[y * self.w + x]
        }

        fn neighbours(&self, x: usize, y: usize) -> usize {
            (-1..=1)
                .flat_map(|dy| (-1..=1).map(move |dx| (dx, dy)))
                .filter(|&(dx, dy)| (dx, dy) != (0, 0) && self.alive(x as isize + dx, y as isize + dy))
                .count()
        }

        fn step(&self) -> Grid {
            let cells = (0..self.h)
                .flat_map(|y| (0..self.w).map(move |x| (x, y)))
                .map(|(x, y)| matches!((self.cells[y * self.w + x], self.neighbours(x, y)), (true, 2) | (_, 3)))
                .collect();
            Grid { w: self.w, h: self.h, cells }
        }

        fn population(&self) -> usize {
            self.cells.iter().filter(|&&c| c).count()
        }

        fn print(&self) {
            for row in self.cells.chunks(self.w) {
                let line: String = row.iter().map(|&c| if c { '#' } else { '.' }).collect();
                println!("  {line}");
            }
        }
    }

    pub fn run() {
        let glider = [".#.", "..#", "###"];
        let g0 = Grid::from_pattern(10, 10, &glider, (1, 1));
        let g4 = (0..4).fold(g0, |g, _| g.step());
        check("a glider moves one cell diagonally every 4 generations", g4 == Grid::from_pattern(10, 10, &glider, (2, 2)));

        let blinker = Grid::from_pattern(5, 5, &["###"], (1, 2));
        check("a blinker repeats every 2 generations", blinker.step().step() == blinker && blinker.step() != blinker);

        let mut grid = Grid::from_pattern(64, 20, &[".##", "##.", ".#."], (30, 8));
        let mut populations = Vec::new();
        for generation in 0..=120 {
            if generation % 10 == 0 {
                populations.push(grid.population());
            }
            if generation < 120 {
                grid = grid.step();
            }
        }
        println!("  An R-pentomino on a 64x20 torus, after 120 generations:");
        grid.print();
        println!("  population every 10 generations: {populations:?}");
    }
}

// ---------------------------------------------------------------------------
// 6. Maze: generation with an explicit stack, solving with breadth-first search
// ---------------------------------------------------------------------------

mod maze {
    use super::check;
    use crate::util::XorShift;
    use std::collections::VecDeque;

    struct Maze {
        w: usize,
        h: usize,
        /// Whether there is a wall to the right of / below each cell.
        right: Vec<bool>,
        down: Vec<bool>,
    }

    impl Maze {
        fn generate(w: usize, h: usize, rng: &mut XorShift) -> Maze {
            let mut maze = Maze { w, h, right: vec![true; w * h], down: vec![true; w * h] };
            let mut visited = vec![false; w * h];
            let mut stack = vec![0usize];
            visited[0] = true;
            while let Some(&cell) = stack.last() {
                let (x, y) = (cell % w, cell / w);
                let mut options: Vec<usize> = Vec::new();
                if x > 0 && !visited[cell - 1] {
                    options.push(cell - 1);
                }
                if x + 1 < w && !visited[cell + 1] {
                    options.push(cell + 1);
                }
                if y > 0 && !visited[cell - w] {
                    options.push(cell - w);
                }
                if y + 1 < h && !visited[cell + w] {
                    options.push(cell + w);
                }
                if options.is_empty() {
                    stack.pop();
                    continue;
                }
                let next = options[rng.below(options.len())];
                maze.open(cell, next);
                visited[next] = true;
                stack.push(next);
            }
            maze
        }

        fn open(&mut self, a: usize, b: usize) {
            let (lo, hi) = (a.min(b), a.max(b));
            if hi == lo + 1 {
                self.right[lo] = false;
            } else {
                self.down[lo] = false;
            }
        }

        fn neighbours(&self, cell: usize) -> Vec<usize> {
            let (x, y) = (cell % self.w, cell / self.w);
            let mut out = Vec::with_capacity(4);
            if x + 1 < self.w && !self.right[cell] {
                out.push(cell + 1);
            }
            if x > 0 && !self.right[cell - 1] {
                out.push(cell - 1);
            }
            if y + 1 < self.h && !self.down[cell] {
                out.push(cell + self.w);
            }
            if y > 0 && !self.down[cell - self.w] {
                out.push(cell - self.w);
            }
            out
        }

        fn solve(&self) -> Option<Vec<usize>> {
            let goal = self.w * self.h - 1;
            let mut prev = vec![usize::MAX; self.w * self.h];
            let mut queue = VecDeque::from([0usize]);
            prev[0] = 0;
            while let Some(cell) = queue.pop_front() {
                if cell == goal {
                    let mut path = vec![goal];
                    let mut c = goal;
                    while c != 0 {
                        c = prev[c];
                        path.push(c);
                    }
                    path.reverse();
                    return Some(path);
                }
                for n in self.neighbours(cell) {
                    if prev[n] == usize::MAX {
                        prev[n] = cell;
                        queue.push_back(n);
                    }
                }
            }
            None
        }

        fn print(&self, path: &[usize]) {
            let on_path: std::collections::HashSet<usize> = path.iter().copied().collect();
            println!("  +{}", "--+".repeat(self.w));
            for y in 0..self.h {
                let mut cells = String::from("  |");
                let mut walls = String::from("  +");
                for x in 0..self.w {
                    let cell = y * self.w + x;
                    cells.push_str(if on_path.contains(&cell) { "<>" } else { "  " });
                    cells.push(if self.right[cell] { '|' } else { ' ' });
                    walls.push_str(if self.down[cell] { "--+" } else { "  +" });
                }
                println!("{cells}");
                println!("{walls}");
            }
        }
    }

    pub fn run() {
        let mut rng = XorShift::new(2024);
        let maze = Maze::generate(24, 10, &mut rng);
        let passages = maze.right.iter().chain(&maze.down).filter(|&&wall| !wall).count()
            - (0..maze.h).filter(|y| !maze.right[y * maze.w + maze.w - 1]).count()
            - (0..maze.w).filter(|x| !maze.down[(maze.h - 1) * maze.w + x]).count();
        check("the maze is a tree: one passage fewer than cells", passages == maze.w * maze.h - 1);
        match maze.solve() {
            Some(path) => {
                maze.print(&path);
                println!("  the way through is {} cells long", path.len());
                check("the path starts top left and ends bottom right", path[0] == 0 && *path.last().unwrap() == maze.w * maze.h - 1);
            }
            None => check("the maze has a way through", false),
        }
    }
}

// ---------------------------------------------------------------------------
// 7. Sudoku: backtracking with bit masks
// ---------------------------------------------------------------------------

mod sudoku {
    use super::check;

    struct Solver {
        grid: [u8; 81],
        rows: [u16; 9],
        cols: [u16; 9],
        boxes: [u16; 9],
        steps: u64,
    }

    fn box_of(i: usize) -> usize {
        (i / 27) * 3 + (i % 9) / 3
    }

    impl Solver {
        fn new(puzzle: &str) -> Solver {
            let mut s = Solver { grid: [0; 81], rows: [0; 9], cols: [0; 9], boxes: [0; 9], steps: 0 };
            for (i, c) in puzzle.bytes().enumerate() {
                if (b'1'..=b'9').contains(&c) {
                    s.place(i, c - b'0');
                }
            }
            s
        }

        fn place(&mut self, i: usize, d: u8) {
            self.grid[i] = d;
            let bit = 1 << d;
            self.rows[i / 9] |= bit;
            self.cols[i % 9] |= bit;
            self.boxes[box_of(i)] |= bit;
        }

        fn unplace(&mut self, i: usize, d: u8) {
            self.grid[i] = 0;
            let bit = !(1 << d);
            self.rows[i / 9] &= bit;
            self.cols[i % 9] &= bit;
            self.boxes[box_of(i)] &= bit;
        }

        fn candidates(&self, i: usize) -> u16 {
            !(self.rows[i / 9] | self.cols[i % 9] | self.boxes[box_of(i)]) & 0b11_1111_1110
        }

        fn solve(&mut self) -> bool {
            self.steps += 1;
            // The empty cell with the fewest candidates.
            let mut best: Option<(usize, u16)> = None;
            for i in 0..81 {
                if self.grid[i] != 0 {
                    continue;
                }
                let c = self.candidates(i);
                let n = c.count_ones();
                if n == 0 {
                    return false;
                }
                if best.is_none_or(|(_, b)| n < b.count_ones()) {
                    best = Some((i, c));
                    if n == 1 {
                        break;
                    }
                }
            }
            let Some((i, mut c)) = best else {
                return true;
            };
            while c != 0 {
                let d = c.trailing_zeros() as u8;
                c &= c - 1;
                self.place(i, d);
                if self.solve() {
                    return true;
                }
                self.unplace(i, d);
            }
            false
        }

        fn print(&self) {
            for (r, row) in self.grid.chunks(9).enumerate() {
                if r % 3 == 0 && r > 0 {
                    println!("  ------+-------+------");
                }
                let line: Vec<String> = row
                    .chunks(3)
                    .map(|part| part.iter().map(|&d| if d == 0 { ".".to_string() } else { d.to_string() }).collect::<Vec<_>>().join(" "))
                    .collect();
                println!("  {}", line.join(" | "));
            }
        }

        fn is_complete(&self) -> bool {
            let full = 0b11_1111_1110;
            self.rows.iter().chain(&self.cols).chain(&self.boxes).all(|&m| m == full)
        }
    }

    pub fn run() {
        // Arto Inkala's "world's hardest sudoku".
        let puzzle = "800000000003600000070090200050007000000045700000100030001000068008500010090000400";
        let expected = "812753649943682175675491283154237896369845721287169534521974368438526917796318452";
        let mut solver = Solver::new(puzzle);
        solver.print();
        let solved = solver.solve();
        println!("  solved in {} steps:", solver.steps);
        solver.print();
        let got: String = solver.grid.iter().map(|d| (b'0' + d) as char).collect();
        check("the solution is complete and the known one", solved && solver.is_complete() && got == expected);
    }
}

// ---------------------------------------------------------------------------
// 8. Primes: a segmented sieve on scoped threads, results over a channel
// ---------------------------------------------------------------------------

mod primes {
    use super::check;
    use std::sync::mpsc;
    use std::thread;

    fn simple_sieve(limit: usize) -> Vec<usize> {
        let mut composite = vec![false; limit + 1];
        let mut primes = Vec::new();
        for n in 2..=limit {
            if !composite[n] {
                primes.push(n);
                let mut m = n * n;
                while m <= limit {
                    composite[m] = true;
                    m += n;
                }
            }
        }
        primes
    }

    fn segment(lo: usize, hi: usize, base: &[usize]) -> Vec<usize> {
        let mut composite = vec![false; hi - lo];
        for &p in base {
            if p * p >= hi {
                break;
            }
            let mut m = (p * p).max(lo.div_ceil(p) * p);
            while m < hi {
                composite[m - lo] = true;
                m += p;
            }
        }
        (lo.max(2)..hi).filter(|&n| !composite[n - lo]).collect()
    }

    /// The primes below `n`, sieved in `threads` segments in parallel.
    pub fn primes_below(n: usize, threads: usize) -> Vec<usize> {
        let base = simple_sieve(n.isqrt() + 1);
        let chunk = n.div_ceil(threads);
        let (tx, rx) = mpsc::channel();
        thread::scope(|s| {
            for t in 0..threads {
                let (tx, base) = (tx.clone(), &base);
                s.spawn(move || {
                    let lo = t * chunk;
                    let hi = ((t + 1) * chunk).min(n);
                    tx.send((t, segment(lo, hi, base))).unwrap();
                });
            }
        });
        drop(tx);
        let mut parts: Vec<(usize, Vec<usize>)> = rx.iter().collect();
        parts.sort_by_key(|p| p.0);
        parts.into_iter().flat_map(|p| p.1).collect()
    }

    pub fn run() {
        let n = 2_000_000;
        let parallel = primes_below(n, 4);
        let serial = primes_below(n, 1);
        let sum: u64 = parallel.iter().map(|&p| p as u64).sum();
        println!("  primes below 100: {:?}", parallel.iter().take_while(|&&p| p < 100).collect::<Vec<_>>());
        println!("  below {n}: {} primes, the largest {}, adding up to {sum}", parallel.len(), parallel.last().unwrap());
        let twins = parallel.windows(2).filter(|w| w[1] - w[0] == 2).count();
        println!("  twin prime pairs: {twins}");
        check("there are 148933 primes below 2 million", parallel.len() == 148_933);
        check("they add up to 142913828922", sum == 142_913_828_922);
        check("four threads agree with one", parallel == serial);
    }
}

// ---------------------------------------------------------------------------
// 9. Sorting: generic algorithms, slices, function pointers
// ---------------------------------------------------------------------------

mod sorting {
    use super::check;
    use crate::util::XorShift;
    use std::time::Instant;

    pub fn insertion<T: Ord + Copy>(v: &mut [T]) {
        for i in 1..v.len() {
            let x = v[i];
            let mut j = i;
            while j > 0 && v[j - 1] > x {
                v[j] = v[j - 1];
                j -= 1;
            }
            v[j] = x;
        }
    }

    pub fn merge<T: Ord + Copy>(v: &mut [T]) {
        if v.len() <= 16 {
            insertion(v);
            return;
        }
        let mid = v.len() / 2;
        merge(&mut v[..mid]);
        merge(&mut v[mid..]);
        let mut out = Vec::with_capacity(v.len());
        let (mut i, mut j) = (0, mid);
        while i < mid && j < v.len() {
            if v[j] < v[i] {
                out.push(v[j]);
                j += 1;
            } else {
                out.push(v[i]);
                i += 1;
            }
        }
        out.extend_from_slice(&v[i..mid]);
        out.extend_from_slice(&v[j..]);
        v.copy_from_slice(&out);
    }

    fn partition<T: Ord + Copy>(v: &mut [T]) -> usize {
        let n = v.len();
        let mid = n / 2;
        // The median of the first, middle and last goes last, as the pivot.
        if v[mid] < v[0] {
            v.swap(mid, 0);
        }
        if v[n - 1] < v[0] {
            v.swap(n - 1, 0);
        }
        if v[mid] < v[n - 1] {
            v.swap(mid, n - 1);
        }
        let pivot = v[n - 1];
        let mut store = 0;
        for i in 0..n - 1 {
            if v[i] < pivot {
                v.swap(i, store);
                store += 1;
            }
        }
        v.swap(store, n - 1);
        store
    }

    pub fn quick<T: Ord + Copy>(mut v: &mut [T]) {
        loop {
            if v.len() <= 16 {
                insertion(v);
                return;
            }
            let p = partition(v);
            let (left, right) = std::mem::take(&mut v).split_at_mut(p);
            let right = &mut right[1..];
            // Recurse into the smaller side, loop on the larger.
            if left.len() < right.len() {
                quick(left);
                v = right;
            } else {
                quick(right);
                v = left;
            }
        }
    }

    pub fn heap<T: Ord + Copy>(v: &mut [T]) {
        fn sift<T: Ord>(v: &mut [T], mut i: usize, n: usize) {
            loop {
                let l = 2 * i + 1;
                if l >= n {
                    return;
                }
                let c = if l + 1 < n && v[l + 1] > v[l] { l + 1 } else { l };
                if v[c] <= v[i] {
                    return;
                }
                v.swap(i, c);
                i = c;
            }
        }
        let n = v.len();
        for i in (0..n / 2).rev() {
            sift(v, i, n);
        }
        for end in (1..n).rev() {
            v.swap(0, end);
            sift(v, 0, end);
        }
    }

    pub fn shell<T: Ord + Copy>(v: &mut [T]) {
        for gap in [701, 301, 132, 57, 23, 10, 4, 1] {
            for i in gap..v.len() {
                let x = v[i];
                let mut j = i;
                while j >= gap && v[j - gap] > x {
                    v[j] = v[j - gap];
                    j -= gap;
                }
                v[j] = x;
            }
        }
    }

    pub fn radix(v: &mut [u32]) {
        let mut buf = vec![0u32; v.len()];
        for shift in [0, 8, 16, 24] {
            let mut counts = [0usize; 257];
            for &x in v.iter() {
                counts[((x >> shift) & 0xff) as usize + 1] += 1;
            }
            for i in 1..257 {
                counts[i] += counts[i - 1];
            }
            for &x in v.iter() {
                let b = ((x >> shift) & 0xff) as usize;
                buf[counts[b]] = x;
                counts[b] += 1;
            }
            v.copy_from_slice(&buf);
        }
    }

    pub fn run() {
        let mut rng = XorShift::new(7);
        let random: Vec<u32> = (0..20_000).map(|_| rng.next_u64() as u32).collect();
        let mut expected = random.clone();
        expected.sort_unstable();

        let algorithms: [(&str, fn(&mut [u32]), usize); 6] = [
            ("insertion", insertion::<u32>, 2_000),
            ("shell", shell::<u32>, 20_000),
            ("merge", merge::<u32>, 20_000),
            ("quick", quick::<u32>, 20_000),
            ("heap", heap::<u32>, 20_000),
            ("radix", radix, 20_000),
        ];
        println!("  {:<10} {:>7} {:>9}  sorted?", "algorithm", "n", "ms");
        let mut all_sorted = true;
        for (name, sort, n) in algorithms {
            let mut v = random[..n].to_vec();
            let t = Instant::now();
            sort(&mut v);
            let ms = t.elapsed().as_secs_f64() * 1000.0;
            let mut reference = random[..n].to_vec();
            reference.sort_unstable();
            let ok = v == reference;
            all_sorted &= ok;
            println!("  {name:<10} {n:>7} {ms:>9.1}  {}", if ok { "yes" } else { "NO" });
        }
        check("every algorithm sorts 20000 random numbers like the standard library", all_sorted);

        let mut ascending: Vec<u32> = (0..20_000).collect();
        let mut descending: Vec<u32> = (0..20_000).rev().collect();
        quick(&mut ascending);
        quick(&mut descending);
        check("quicksort handles sorted and reversed input", ascending == descending && ascending == expected_seq(20_000));

        let mut words: Vec<&str> = crate::util::GETTYSBURG.split_whitespace().collect();
        merge(&mut words);
        words.dedup();
        println!("  first words in order: {}", words[..8].join(", "));
        check("merge sort works on strings too", words.windows(2).all(|w| w[0] < w[1]));
        let target = words[words.len() / 2];
        check("binary search finds a word", words.binary_search(&target) == Ok(words.len() / 2));
    }

    fn expected_seq(n: u32) -> Vec<u32> {
        (0..n).collect()
    }
}

// ---------------------------------------------------------------------------
// 10. JSON: a hand-written parser, checked against serde_json
// ---------------------------------------------------------------------------

mod json {
    use super::check;
    use std::fmt;

    #[derive(Debug, Clone, PartialEq)]
    pub enum Json {
        Null,
        Bool(bool),
        Num(f64),
        Str(String),
        Arr(Vec<Json>),
        Obj(Vec<(String, Json)>),
    }

    #[derive(Debug)]
    pub struct ParseError {
        pos: usize,
        msg: String,
    }

    impl fmt::Display for ParseError {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            write!(f, "{} at byte {}", self.msg, self.pos)
        }
    }

    impl std::error::Error for ParseError {}

    struct Parser<'a> {
        s: &'a [u8],
        pos: usize,
    }

    impl<'a> Parser<'a> {
        fn err<T>(&self, msg: impl Into<String>) -> Result<T, ParseError> {
            Err(ParseError { pos: self.pos, msg: msg.into() })
        }

        fn peek(&self) -> Option<u8> {
            self.s.get(self.pos).copied()
        }

        fn ws(&mut self) {
            while matches!(self.peek(), Some(b' ' | b'\n' | b'\r' | b'\t')) {
                self.pos += 1;
            }
        }

        fn expect(&mut self, b: u8) -> Result<(), ParseError> {
            self.ws();
            if self.peek() == Some(b) {
                self.pos += 1;
                Ok(())
            } else {
                self.err(format!("expected '{}'", b as char))
            }
        }

        fn literal(&mut self, word: &str, value: Json) -> Result<Json, ParseError> {
            if self.s[self.pos..].starts_with(word.as_bytes()) {
                self.pos += word.len();
                Ok(value)
            } else {
                self.err(format!("expected {word}"))
            }
        }

        fn value(&mut self) -> Result<Json, ParseError> {
            self.ws();
            match self.peek() {
                Some(b'n') => self.literal("null", Json::Null),
                Some(b't') => self.literal("true", Json::Bool(true)),
                Some(b'f') => self.literal("false", Json::Bool(false)),
                Some(b'"') => Ok(Json::Str(self.string()?)),
                Some(b'[') => self.array(),
                Some(b'{') => self.object(),
                Some(b'-' | b'0'..=b'9') => self.number(),
                Some(c) => self.err(format!("unexpected '{}'", c as char)),
                None => self.err("unexpected end"),
            }
        }

        fn hex4(&mut self) -> Result<u32, ParseError> {
            let digits = self.s.get(self.pos..self.pos + 4).and_then(|h| std::str::from_utf8(h).ok());
            match digits.and_then(|h| u32::from_str_radix(h, 16).ok()) {
                Some(v) => {
                    self.pos += 4;
                    Ok(v)
                }
                None => self.err("bad \\u escape"),
            }
        }

        fn string(&mut self) -> Result<String, ParseError> {
            self.expect(b'"')?;
            let mut out = Vec::new();
            loop {
                let Some(c) = self.peek() else {
                    return self.err("unterminated string");
                };
                self.pos += 1;
                match c {
                    b'"' => break,
                    b'\\' => {
                        let Some(e) = self.peek() else {
                            return self.err("unterminated escape");
                        };
                        self.pos += 1;
                        let ch = match e {
                            b'n' => '\n',
                            b't' => '\t',
                            b'r' => '\r',
                            b'b' => '\u{8}',
                            b'f' => '\u{c}',
                            b'/' => '/',
                            b'\\' => '\\',
                            b'"' => '"',
                            b'u' => {
                                let mut code = self.hex4()?;
                                if (0xd800..0xdc00).contains(&code) && self.s[self.pos..].starts_with(b"\\u") {
                                    self.pos += 2;
                                    let low = self.hex4()?;
                                    code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
                                }
                                match char::from_u32(code) {
                                    Some(c) => c,
                                    None => return self.err("bad code point"),
                                }
                            }
                            other => return self.err(format!("bad escape \\{}", other as char)),
                        };
                        let mut buf = [0; 4];
                        out.extend_from_slice(ch.encode_utf8(&mut buf).as_bytes());
                    }
                    c => out.push(c),
                }
            }
            String::from_utf8(out).or_else(|_| self.err("invalid UTF-8"))
        }

        fn number(&mut self) -> Result<Json, ParseError> {
            let start = self.pos;
            while matches!(self.peek(), Some(b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9')) {
                self.pos += 1;
            }
            let text = std::str::from_utf8(&self.s[start..self.pos]).unwrap();
            match text.parse::<f64>() {
                Ok(n) => Ok(Json::Num(n)),
                Err(_) => self.err(format!("bad number {text}")),
            }
        }

        fn array(&mut self) -> Result<Json, ParseError> {
            self.expect(b'[')?;
            let mut items = Vec::new();
            self.ws();
            if self.peek() == Some(b']') {
                self.pos += 1;
                return Ok(Json::Arr(items));
            }
            loop {
                items.push(self.value()?);
                self.ws();
                match self.peek() {
                    Some(b',') => self.pos += 1,
                    Some(b']') => {
                        self.pos += 1;
                        return Ok(Json::Arr(items));
                    }
                    _ => return self.err("expected ',' or ']'"),
                }
            }
        }

        fn object(&mut self) -> Result<Json, ParseError> {
            self.expect(b'{')?;
            let mut fields = Vec::new();
            self.ws();
            if self.peek() == Some(b'}') {
                self.pos += 1;
                return Ok(Json::Obj(fields));
            }
            loop {
                self.ws();
                let key = self.string()?;
                self.expect(b':')?;
                fields.push((key, self.value()?));
                self.ws();
                match self.peek() {
                    Some(b',') => self.pos += 1,
                    Some(b'}') => {
                        self.pos += 1;
                        return Ok(Json::Obj(fields));
                    }
                    _ => return self.err("expected ',' or '}'"),
                }
            }
        }
    }

    pub fn parse(src: &str) -> Result<Json, ParseError> {
        let mut p = Parser { s: src.as_bytes(), pos: 0 };
        let v = p.value()?;
        p.ws();
        if p.pos != p.s.len() {
            return p.err("trailing characters");
        }
        Ok(v)
    }

    fn write_str(out: &mut String, s: &str) {
        out.push('"');
        for c in s.chars() {
            match c {
                '"' => out.push_str("\\\""),
                '\\' => out.push_str("\\\\"),
                '\n' => out.push_str("\\n"),
                '\t' => out.push_str("\\t"),
                c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
                c => out.push(c),
            }
        }
        out.push('"');
    }

    impl Json {
        pub fn pretty(&self, indent: usize, out: &mut String) {
            let pad = |n| "  ".repeat(n);
            match self {
                Json::Arr(items) if !items.is_empty() => {
                    out.push_str("[\n");
                    for (i, item) in items.iter().enumerate() {
                        out.push_str(&pad(indent + 1));
                        item.pretty(indent + 1, out);
                        out.push_str(if i + 1 < items.len() { ",\n" } else { "\n" });
                    }
                    out.push_str(&pad(indent));
                    out.push(']');
                }
                Json::Obj(fields) if !fields.is_empty() => {
                    out.push_str("{\n");
                    for (i, (k, v)) in fields.iter().enumerate() {
                        out.push_str(&pad(indent + 1));
                        write_str(out, k);
                        out.push_str(": ");
                        v.pretty(indent + 1, out);
                        out.push_str(if i + 1 < fields.len() { ",\n" } else { "\n" });
                    }
                    out.push_str(&pad(indent));
                    out.push('}');
                }
                other => out.push_str(&other.to_string()),
            }
        }

        /// With object keys sorted, as serde_json keeps them.
        fn normalized(&self) -> Json {
            match self {
                Json::Arr(items) => Json::Arr(items.iter().map(Json::normalized).collect()),
                Json::Obj(fields) => {
                    let mut fields: Vec<_> = fields.iter().map(|(k, v)| (k.clone(), v.normalized())).collect();
                    fields.sort_by(|a, b| a.0.cmp(&b.0));
                    Json::Obj(fields)
                }
                other => other.clone(),
            }
        }
    }

    impl fmt::Display for Json {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            match self {
                Json::Null => write!(f, "null"),
                Json::Bool(b) => write!(f, "{b}"),
                Json::Num(n) if n.fract() == 0.0 && n.abs() < 1e15 => write!(f, "{}", *n as i64),
                Json::Num(n) => write!(f, "{n}"),
                Json::Str(s) => {
                    let mut out = String::new();
                    write_str(&mut out, s);
                    f.write_str(&out)
                }
                Json::Arr(items) => {
                    write!(f, "[")?;
                    for (i, item) in items.iter().enumerate() {
                        if i > 0 {
                            write!(f, ",")?;
                        }
                        write!(f, "{item}")?;
                    }
                    write!(f, "]")
                }
                Json::Obj(fields) => {
                    write!(f, "{{")?;
                    for (i, (k, v)) in fields.iter().enumerate() {
                        if i > 0 {
                            write!(f, ",")?;
                        }
                        write!(f, "{}:{v}", Json::Str(k.clone()))?;
                    }
                    write!(f, "}}")
                }
            }
        }
    }

    impl From<&serde_json::Value> for Json {
        fn from(v: &serde_json::Value) -> Json {
            use serde_json::Value as V;
            match v {
                V::Null => Json::Null,
                V::Bool(b) => Json::Bool(*b),
                V::Number(n) => Json::Num(n.as_f64().unwrap()),
                V::String(s) => Json::Str(s.clone()),
                V::Array(items) => Json::Arr(items.iter().map(Json::from).collect()),
                V::Object(map) => Json::Obj(map.iter().map(|(k, v)| (k.clone(), Json::from(v))).collect()),
            }
        }
    }

    pub fn run() {
        let doc = r#"{
            "name": "Ferris",
            "languages": ["Rust", "WebAssembly", "日本語"],
            "crab": "🦀",
            "escapes": "tab\there, quote \" and newline\n",
            "stats": {"legs": 10, "claws": 2, "pi": 3.14159, "big": -2.5e3, "tiny": 1e-7},
            "flags": [true, false, null],
            "empty": {"list": [], "object": {}}
        }"#;
        let ours = match parse(doc) {
            Ok(v) => v,
            Err(e) => {
                check(&format!("the document parses ({e})"), false);
                return;
            }
        };
        let mut pretty = String::new();
        ours.pretty(1, &mut pretty);
        println!("  {pretty}");

        let theirs: serde_json::Value = serde_json::from_str(doc).unwrap();
        check("our parser agrees with serde_json", ours.normalized() == Json::from(&theirs));
        let compact = ours.to_string();
        check("printing and parsing again gives the same value", parse(&compact).map(|v| v == ours).unwrap_or(false));
        let reparsed: serde_json::Value = serde_json::from_str(&compact).unwrap();
        // As numbers: serde_json keeps -2.5e3 as a float, but reads our -2500
        // as an integer.
        check("serde_json reads what we print", Json::from(&reparsed) == Json::from(&theirs));

        let built = serde_json::json!({ "built": "with json!", "n": [1, 2, 3] });
        println!("  serde_json::json! gives {built}");
        for bad in ["[1, 2,]", "{\"a\" 1}", "\"unterminated", "[1] x"] {
            match parse(bad) {
                Ok(v) => println!("  {bad:<16} parsed?! {v}"),
                Err(e) => println!("  {bad:<16} error: {e}"),
            }
        }
        check("bad documents are rejected", ["[1, 2,]", "{\"a\" 1}", "\"unterminated", "[1] x"].iter().all(|b| parse(b).is_err()));
    }
}

// ---------------------------------------------------------------------------
// 11. Text: HashMap and BTreeMap, sorting by key, Unicode, regex, itertools
// ---------------------------------------------------------------------------

mod text {
    use super::check;
    use crate::util::GETTYSBURG;
    use itertools::Itertools;
    use std::collections::{BTreeMap, HashMap};

    pub fn run() {
        let words: Vec<String> = GETTYSBURG
            .split(|c: char| !c.is_alphabetic())
            .filter(|w| !w.is_empty())
            .map(str::to_lowercase)
            .collect();
        let mut counts: HashMap<&str, usize> = HashMap::new();
        for w in &words {
            *counts.entry(w.as_str()).or_default() += 1;
        }
        let mut top: Vec<(&str, usize)> = counts.iter().map(|(w, c)| (*w, *c)).collect();
        top.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
        println!("  The Gettysburg Address: {} words, {} different", words.len(), counts.len());
        println!("  most common: {}", top.iter().take(8).map(|(w, c)| format!("{w} ({c})")).join(", "));

        let by_length: BTreeMap<usize, Vec<&str>> = counts.keys().fold(BTreeMap::new(), |mut m, w| {
            m.entry(w.chars().count()).or_insert_with(Vec::new).push(*w);
            m
        });
        let (longest_len, longest) = by_length.iter().next_back().unwrap();
        println!("  longest words ({longest_len} letters): {}", longest.iter().sorted().join(", "));
        let bigram = words.iter().tuple_windows().map(|(a, b)| format!("{a} {b}")).counts().into_iter().max_by(|a, b| a.1.cmp(&b.1).then(b.0.cmp(&a.0))).unwrap();
        println!("  most common pair of words: \"{}\" ({} times)", bigram.0, bigram.1);
        check("counting by hand agrees with the map", counts.values().sum::<usize>() == words.len());

        let s = "Grüße aus Zürich — 東京 🦀!";
        let reversed: String = s.chars().rev().collect();
        println!("  {s:?}: {} bytes, {} chars; reversed {reversed:?}; upper {:?}", s.len(), s.chars().count(), s.to_uppercase());
        check("reversing twice gives the original", reversed.chars().rev().collect::<String>() == s);
        check("ß uppercases to SS", s.to_uppercase().contains("GRÜSSE"));

        let log = "2024-03-01 boot ok\n2024-03-17 disk warning\nnot a date 2024-3-5\n2025-12-31 year end";
        let date = regex::Regex::new(r"(?m)^(\d{4})-(\d{2})-(\d{2})").unwrap();
        let reformatted = date.replace_all(log, "$3/$2/$1");
        println!("  dates rewritten with regex:");
        for line in reformatted.lines() {
            println!("    {line}");
        }
        check("regex finds the three well-formed dates", date.find_iter(log).count() == 3);
    }
}

// ---------------------------------------------------------------------------
// 12. Huffman coding: BinaryHeap, Box trees, recursion
// ---------------------------------------------------------------------------

mod huffman {
    use super::check;
    use std::cmp::Reverse;
    use std::collections::{BTreeMap, BinaryHeap};

    enum Node {
        Leaf(char),
        Branch(Box<Node>, Box<Node>),
    }

    fn build(text: &str) -> Node {
        let mut counts: BTreeMap<char, usize> = BTreeMap::new();
        for c in text.chars() {
            *counts.entry(c).or_default() += 1;
        }
        // The heap holds (weight, insertion order, index): the order breaks
        // ties, so the tree is the same on every run.
        let mut nodes: Vec<Option<Node>> = Vec::new();
        let mut heap = BinaryHeap::new();
        for (c, n) in counts {
            heap.push(Reverse((n, nodes.len())));
            nodes.push(Some(Node::Leaf(c)));
        }
        while heap.len() > 1 {
            let Reverse((wa, a)) = heap.pop().unwrap();
            let Reverse((wb, b)) = heap.pop().unwrap();
            let node = Node::Branch(Box::new(nodes[a].take().unwrap()), Box::new(nodes[b].take().unwrap()));
            heap.push(Reverse((wa + wb, nodes.len())));
            nodes.push(Some(node));
        }
        let Reverse((_, root)) = heap.pop().unwrap();
        nodes[root].take().unwrap()
    }

    fn codes(node: &Node, prefix: &mut Vec<bool>, out: &mut BTreeMap<char, Vec<bool>>) {
        match node {
            Node::Leaf(c) => {
                out.insert(*c, if prefix.is_empty() { vec![false] } else { prefix.clone() });
            }
            Node::Branch(zero, one) => {
                prefix.push(false);
                codes(zero, prefix, out);
                prefix.pop();
                prefix.push(true);
                codes(one, prefix, out);
                prefix.pop();
            }
        }
    }

    fn decode(root: &Node, bits: &[bool]) -> String {
        let mut out = String::new();
        let mut node = root;
        for &bit in bits {
            if let Node::Branch(zero, one) = node {
                node = if bit { one } else { zero };
            }
            if let Node::Leaf(c) = node {
                out.push(*c);
                node = root;
            }
        }
        out
    }

    pub fn run() {
        let text = crate::util::GETTYSBURG;
        let tree = build(text);
        let mut table = BTreeMap::new();
        codes(&tree, &mut Vec::new(), &mut table);
        let bits: Vec<bool> = text.chars().flat_map(|c| table[&c].iter().copied()).collect();
        let mut by_length: Vec<_> = table.iter().collect();
        by_length.sort_by_key(|(c, code)| (code.len(), **c));
        for (c, code) in by_length.iter().take(6) {
            let code: String = code.iter().map(|&b| if b { '1' } else { '0' }).collect();
            println!("  {c:?} -> {code}");
        }
        println!(
            "  {} characters: {} bits instead of {} ({:.1}% of the size)",
            text.chars().count(),
            bits.len(),
            text.len() * 8,
            bits.len() as f64 * 100.0 / (text.len() * 8) as f64
        );
        check("decoding gives the text back", decode(&tree, &bits) == text);
    }
}

// ---------------------------------------------------------------------------
// 13. Matrices with const generics
// ---------------------------------------------------------------------------

mod matrix {
    use super::check;
    use std::fmt;
    use std::ops::Mul;

    #[derive(Clone, Copy, PartialEq, Debug)]
    pub struct Matrix<const R: usize, const C: usize>(pub [[f64; C]; R]);

    impl<const R: usize, const C: usize> Matrix<R, C> {
        pub fn transpose(&self) -> Matrix<C, R> {
            let mut m = [[0.0; R]; C];
            for (i, row) in self.0.iter().enumerate() {
                for (j, &x) in row.iter().enumerate() {
                    m[j][i] = x;
                }
            }
            Matrix(m)
        }
    }

    impl<const N: usize> Matrix<N, N> {
        pub fn identity() -> Self {
            let mut m = [[0.0; N]; N];
            for (i, row) in m.iter_mut().enumerate() {
                row[i] = 1.0;
            }
            Matrix(m)
        }

        pub fn hilbert() -> Self {
            let mut m = [[0.0; N]; N];
            for (i, row) in m.iter_mut().enumerate() {
                for (j, x) in row.iter_mut().enumerate() {
                    *x = 1.0 / (i + j + 1) as f64;
                }
            }
            Matrix(m)
        }

        pub fn determinant(&self) -> f64 {
            let mut a = self.0;
            let mut det = 1.0;
            for col in 0..N {
                let pivot = (col..N).max_by(|&x, &y| a[x][col].abs().total_cmp(&a[y][col].abs())).unwrap();
                if a[pivot][col] == 0.0 {
                    return 0.0;
                }
                if pivot != col {
                    a.swap(pivot, col);
                    det = -det;
                }
                det *= a[col][col];
                for row in col + 1..N {
                    let factor = a[row][col] / a[col][col];
                    for k in col..N {
                        a[row][k] -= factor * a[col][k];
                    }
                }
            }
            det
        }

        /// Gauss-Jordan elimination with partial pivoting.
        pub fn inverse(&self) -> Option<Self> {
            let mut a = self.0;
            let mut inv = Self::identity().0;
            for col in 0..N {
                let pivot = (col..N).max_by(|&x, &y| a[x][col].abs().total_cmp(&a[y][col].abs()))?;
                if a[pivot][col].abs() < 1e-12 {
                    return None;
                }
                a.swap(pivot, col);
                inv.swap(pivot, col);
                let p = a[col][col];
                for k in 0..N {
                    a[col][k] /= p;
                    inv[col][k] /= p;
                }
                for row in 0..N {
                    if row != col {
                        let factor = a[row][col];
                        for k in 0..N {
                            a[row][k] -= factor * a[col][k];
                            inv[row][k] -= factor * inv[col][k];
                        }
                    }
                }
            }
            Some(Matrix(inv))
        }
    }

    impl<const R: usize, const K: usize, const C: usize> Mul<Matrix<K, C>> for Matrix<R, K> {
        type Output = Matrix<R, C>;
        fn mul(self, o: Matrix<K, C>) -> Matrix<R, C> {
            let mut m = [[0.0; C]; R];
            for i in 0..R {
                for j in 0..C {
                    m[i][j] = (0..K).map(|k| self.0[i][k] * o.0[k][j]).sum();
                }
            }
            Matrix(m)
        }
    }

    impl<const R: usize, const C: usize> fmt::Display for Matrix<R, C> {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            for row in &self.0 {
                write!(f, "   ")?;
                for x in row {
                    write!(f, " {x:>10.4}")?;
                }
                writeln!(f)?;
            }
            Ok(())
        }
    }

    pub fn run() {
        let h: Matrix<4, 4> = Matrix::hilbert();
        println!("  the 4x4 Hilbert matrix:\n{h}");
        let inv = h.inverse().unwrap();
        println!("  its inverse:\n{inv}");
        let expected = [
            [16.0, -120.0, 240.0, -140.0],
            [-120.0, 1200.0, -2700.0, 1680.0],
            [240.0, -2700.0, 6480.0, -4200.0],
            [-140.0, 1680.0, -4200.0, 2800.0],
        ];
        let close = inv.0.iter().flatten().zip(expected.iter().flatten()).all(|(a, b)| (a - b).abs() < 1e-6);
        check("the inverse is the known integer matrix", close);
        let error = (h * inv).0.iter().enumerate().flat_map(|(i, row)| row.iter().enumerate().map(move |(j, &x)| (x - if i == j { 1.0 } else { 0.0 }).abs())).fold(0.0, f64::max);
        println!("  H times its inverse is the identity to within {error:.2e}");
        check("H * H^-1 is the identity", error < 1e-9);
        let det = h.determinant();
        println!("  det(H) = {det:.6e} (1/6048000 = {:.6e})", 1.0 / 6_048_000.0);
        check("the determinant is 1/6048000", (det * 6_048_000.0 - 1.0).abs() < 1e-9);

        let a = Matrix([[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]]);
        let b: Matrix<2, 2> = a * a.transpose();
        check("a 2x3 times its 3x2 transpose", b == Matrix([[14.0, 32.0], [32.0, 77.0]]));
        check("a singular matrix has no inverse", Matrix([[1.0, 2.0], [2.0, 4.0]]).inverse().is_none());
    }
}

// ---------------------------------------------------------------------------
// 14. Traits, iterators, errors and macros
// ---------------------------------------------------------------------------

mod traits {
    use super::check;
    use std::collections::HashMap;
    use std::error::Error;
    use std::fmt;
    use std::num::ParseIntError;

    pub trait Shape: fmt::Debug {
        fn area(&self) -> f64;
        fn perimeter(&self) -> f64;
        fn describe(&self) -> String {
            format!("{self:?}: area {:.2}, perimeter {:.2}", self.area(), self.perimeter())
        }
    }

    #[derive(Debug)]
    struct Circle {
        r: f64,
    }

    #[derive(Debug)]
    struct Rect {
        w: f64,
        h: f64,
    }

    #[derive(Debug)]
    struct Triangle {
        a: f64,
        b: f64,
        c: f64,
    }

    impl Shape for Circle {
        fn area(&self) -> f64 {
            std::f64::consts::PI * self.r * self.r
        }
        fn perimeter(&self) -> f64 {
            2.0 * std::f64::consts::PI * self.r
        }
    }

    impl Shape for Rect {
        fn area(&self) -> f64 {
            self.w * self.h
        }
        fn perimeter(&self) -> f64 {
            2.0 * (self.w + self.h)
        }
    }

    impl Shape for Triangle {
        fn area(&self) -> f64 {
            let s = self.perimeter() / 2.0;
            (s * (s - self.a) * (s - self.b) * (s - self.c)).sqrt()
        }
        fn perimeter(&self) -> f64 {
            self.a + self.b + self.c
        }
    }

    fn largest(shapes: &[Box<dyn Shape>]) -> Option<&dyn Shape> {
        shapes.iter().map(|s| s.as_ref()).max_by(|a, b| a.area().total_cmp(&b.area()))
    }

    fn total_area<'a>(shapes: impl IntoIterator<Item = &'a Box<dyn Shape>>) -> f64 {
        shapes.into_iter().map(|s| s.area()).sum()
    }

    /// The Collatz sequence from `n` down to 1, as an iterator.
    struct Collatz(Option<u64>);

    impl Iterator for Collatz {
        type Item = u64;
        fn next(&mut self) -> Option<u64> {
            let n = self.0?;
            self.0 = match n {
                1 => None,
                n if n % 2 == 0 => Some(n / 2),
                n => Some(3 * n + 1),
            };
            Some(n)
        }
    }

    fn collatz_len_memo(n: u64, memo: &mut HashMap<u64, usize>) -> usize {
        if n == 1 {
            return 1;
        }
        if let Some(&len) = memo.get(&n) {
            return len;
        }
        let next = if n % 2 == 0 { n / 2 } else { 3 * n + 1 };
        let len = 1 + collatz_len_memo(next, memo);
        memo.insert(n, len);
        len
    }

    #[derive(Debug)]
    enum ConfigError {
        Missing(&'static str),
        BadNumber { key: String, source: ParseIntError },
        OutOfRange { key: String, value: i64 },
    }

    impl fmt::Display for ConfigError {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            match self {
                ConfigError::Missing(key) => write!(f, "missing setting '{key}'"),
                ConfigError::BadNumber { key, .. } => write!(f, "'{key}' is not a number"),
                ConfigError::OutOfRange { key, value } => write!(f, "'{key}' = {value} is out of range"),
            }
        }
    }

    impl Error for ConfigError {
        fn source(&self) -> Option<&(dyn Error + 'static)> {
            match self {
                ConfigError::BadNumber { source, .. } => Some(source),
                _ => None,
            }
        }
    }

    #[derive(Debug, PartialEq)]
    struct Config {
        width: i64,
        height: i64,
        title: String,
    }

    fn parse_config(text: &str) -> Result<Config, ConfigError> {
        let pairs: HashMap<&str, &str> = text
            .lines()
            .filter_map(|line| line.split_once('='))
            .map(|(k, v)| (k.trim(), v.trim()))
            .collect();
        let number = |key: &'static str| -> Result<i64, ConfigError> {
            let raw = pairs.get(key).ok_or(ConfigError::Missing(key))?;
            let value: i64 = raw.parse().map_err(|source| ConfigError::BadNumber { key: key.to_string(), source })?;
            if !(1..=10_000).contains(&value) {
                return Err(ConfigError::OutOfRange { key: key.to_string(), value });
            }
            Ok(value)
        };
        Ok(Config {
            width: number("width")?,
            height: number("height")?,
            title: pairs.get("title").map(|s| s.to_string()).unwrap_or_else(|| "untitled".into()),
        })
    }

    macro_rules! hashmap {
        ($($key:expr => $value:expr),* $(,)?) => {{
            let mut map = HashMap::new();
            $(map.insert($key, $value);)*
            map
        }};
    }

    macro_rules! count {
        () => { 0usize };
        ($head:tt $($tail:tt)*) => { 1usize + count!($($tail)*) };
    }

    macro_rules! maximum {
        ($x:expr) => { $x };
        ($x:expr, $($rest:expr),+) => {{ let a = $x; let b = maximum!($($rest),+); if a > b { a } else { b } }};
    }

    pub fn run() {
        let shapes: Vec<Box<dyn Shape>> = vec![
            Box::new(Circle { r: 1.5 }),
            Box::new(Rect { w: 2.0, h: 3.5 }),
            Box::new(Triangle { a: 3.0, b: 4.0, c: 5.0 }),
        ];
        for s in &shapes {
            println!("  {}", s.describe());
        }
        let big = largest(&shapes).unwrap();
        println!("  the largest is {big:?}; together they cover {:.3}", total_area(&shapes));
        check("a 3-4-5 triangle has area 6", (Triangle { a: 3.0, b: 4.0, c: 5.0 }.area() - 6.0).abs() < 1e-12);

        let (best, steps) = (1..10_000u64).map(|n| (n, Collatz(Some(n)).count())).max_by_key(|&(n, len)| (len, std::cmp::Reverse(n))).unwrap();
        println!("  below 10000, {best} has the longest Collatz sequence: {steps} numbers");
        let mut memo = HashMap::new();
        let (best2, steps2) = (1..10_000u64).map(|n| (n, collatz_len_memo(n, &mut memo))).max_by_key(|&(n, len)| (len, std::cmp::Reverse(n))).unwrap();
        check("the iterator and the memoized recursion agree", (best, steps) == (best2, steps2));
        let evens: Vec<u64> = Collatz(Some(27)).filter(|n| n % 2 == 0).skip(3).step_by(10).take(5).collect();
        println!("  some even numbers on the way from 27: {evens:?}");

        let inputs = [
            "width = 640\nheight = 480\ntitle = demo",
            "width = 640",
            "width = 640\nheight = lots",
            "width = 0\nheight = 10",
        ];
        for input in inputs {
            match parse_config(input) {
                Ok(config) => println!("  ok: {config:?}"),
                Err(e) => {
                    let cause = e.source().map(|s| format!(" (because: {s})")).unwrap_or_default();
                    println!("  error: {e}{cause}");
                }
            }
        }
        check("errors carry their cause", matches!(parse_config("width=x"), Err(ConfigError::BadNumber { .. })));

        let ages = hashmap! { "Ferris" => 10, "Corro" => 7, "Wasm" => 9 };
        let mut names: Vec<_> = ages.keys().collect();
        names.sort();
        println!("  hashmap! made {names:?}; count! of 5 tokens = {}; maximum!(3, 9, 4) = {}", count!(a b c d e), maximum!(3, 9, 4));
        check("the macros work", ages["Wasm"] == 9 && count!(x y z) == 3 && maximum!(1, 7, 2, 5) == 7);
    }
}

// ---------------------------------------------------------------------------
// 15. Brainfuck: an interpreter with a precomputed jump table
// ---------------------------------------------------------------------------

mod brainfuck {
    use super::check;

    pub fn run_program(code: &str, input: &[u8]) -> Result<String, String> {
        let ops: Vec<u8> = code.bytes().filter(|b| b"+-<>[].,".contains(b)).collect();
        let mut jumps = vec![0usize; ops.len()];
        let mut open = Vec::new();
        for (i, &op) in ops.iter().enumerate() {
            match op {
                b'[' => open.push(i),
                b']' => {
                    let j = open.pop().ok_or(format!("unmatched ] at {i}"))?;
                    jumps[i] = j;
                    jumps[j] = i;
                }
                _ => {}
            }
        }
        if let Some(i) = open.pop() {
            return Err(format!("unmatched [ at {i}"));
        }
        let (mut tape, mut ptr, mut pc, mut steps) = (vec![0u8; 30_000], 0usize, 0usize, 0u64);
        let mut input = input.iter();
        let mut out = Vec::new();
        while pc < ops.len() {
            match ops[pc] {
                b'+' => tape[ptr] = tape[ptr].wrapping_add(1),
                b'-' => tape[ptr] = tape[ptr].wrapping_sub(1),
                b'>' => ptr = (ptr + 1) % tape.len(),
                b'<' => ptr = (ptr + tape.len() - 1) % tape.len(),
                b'.' => out.push(tape[ptr]),
                b',' => tape[ptr] = input.next().copied().unwrap_or(0),
                b'[' if tape[ptr] == 0 => pc = jumps[pc],
                b']' if tape[ptr] != 0 => pc = jumps[pc],
                _ => {}
            }
            pc += 1;
            steps += 1;
            if steps > 10_000_000 {
                return Err("too many steps".into());
            }
        }
        String::from_utf8(out).map_err(|e| e.to_string())
    }

    pub fn run() {
        let hello = "++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.";
        let out = run_program(hello, b"").unwrap_or_else(|e| format!("error: {e}"));
        print!("  hello world program says: {out}");
        check("it says Hello World!", out == "Hello World!\n");
        let adder = format!(",>,[<+>-]<{}.", "-".repeat(48));
        let sum = run_program(&adder, b"34").unwrap_or_else(|e| format!("error: {e}"));
        println!("  3 + 4 in Brainfuck = {sum}");
        check("3 + 4 = 7", sum == "7");
        check("unmatched brackets are an error", run_program("[[]", b"").is_err());
    }
}

// ---------------------------------------------------------------------------
// 16. Async tasks with tokio: a multi-threaded runtime, channels, select!
// ---------------------------------------------------------------------------

mod async_tasks {
    use super::check;
    use std::time::Duration;

    pub fn run() {
        let runtime = tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build().unwrap();
        runtime.block_on(async {
            // Tasks that sleep less the later they start finish first.
            let mut set = tokio::task::JoinSet::new();
            for i in 1..=5u64 {
                set.spawn(async move {
                    tokio::time::sleep(Duration::from_millis(15 * (6 - i))).await;
                    (i, (1..=i * 1000).map(|x| x * x).sum::<u64>())
                });
            }
            let mut finished = Vec::new();
            while let Some(result) = set.join_next().await {
                finished.push(result.unwrap());
            }
            println!("  tasks finished in the order {:?}", finished.iter().map(|r| r.0).collect::<Vec<_>>());
            check("the task that slept least finished first", finished.first().map(|r| r.0) == Some(5));
            check("sum of squares to 1000 is 333833500", finished.iter().any(|&(i, s)| i == 1 && s == 333_833_500));

            let (tx, mut rx) = tokio::sync::mpsc::channel::<u32>(4);
            let producer = tokio::spawn(async move {
                for i in 0..20 {
                    tx.send(i).await.unwrap();
                }
            });
            let mut total = 0;
            while let Some(v) = rx.recv().await {
                total += v;
            }
            producer.await.unwrap();
            println!("  a channel carried 0..20, adding up to {total}");
            check("all values arrived", total == 190);

            let winner = tokio::select! {
                _ = tokio::time::sleep(Duration::from_millis(300)) => "slow",
                w = async { tokio::time::sleep(Duration::from_millis(20)).await; "fast" } => w,
            };
            println!("  select! picked the {winner} branch");
            check("select! takes the first to finish", winner == "fast");
            let timed_out = tokio::time::timeout(Duration::from_millis(10), tokio::time::sleep(Duration::from_millis(500))).await.is_err();
            check("timeout gives up on a slow future", timed_out);
        });
    }
}
