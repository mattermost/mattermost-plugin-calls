export function getChannelNameForTest() {
    const idx = parseInt(process.env.TEST_PARALLEL_INDEX as string, 10) * 2;
    return `calls${idx}`;
}
