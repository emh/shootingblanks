function* makeGenerator(seed) {
    let value = seed;

    const a = 1103515245;
    const c = 12345;
    const m = Math.pow(2, 31);

    while (true) {
        value = (a * value + c) % m;
        yield value / m;
    }
}

export const prng = (seed) => {
    const generator = makeGenerator(seed);

    return () => generator.next().value;
};
