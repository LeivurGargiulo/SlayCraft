export function createLogger(name) {
    const prefix = `[${name}]`;
    return {
        info: (...args) => console.log(`${new Date().toISOString()} INFO  ${prefix}`, ...args),
        warn: (...args) => console.warn(`${new Date().toISOString()} WARN  ${prefix}`, ...args),
        error: (...args) => console.error(`${new Date().toISOString()} ERROR ${prefix}`, ...args),
        debug: (...args) => {
            if (process.env.DEBUG === 'true') {
                console.log(`${new Date().toISOString()} DEBUG ${prefix}`, ...args);
            }
        }
    };
}
