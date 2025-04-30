/**
 * Checks if a given time tick falls within a recurring window defined by an interval and duration.
 *
 * @param currentTime - The current time tick.
 * @param interval - The total length of one cycle (window duration + cooldown).
 * @param duration - The length of the active window within the interval.
 * @returns True if the current time is within an active window, false otherwise.
 */
export function isWithinWindow(currentTime: number, interval: number, duration: number): boolean {
    if (interval <= 0 || duration <= 0 || duration > interval) {
        // Invalid configuration: duration cannot be longer than interval, and both must be positive.
        console.error(`Invalid window configuration: interval=${interval}, duration=${duration}`);
        return false;
    }
    // The core logic: check if the remainder of currentTime divided by interval is less than the duration.
    return (currentTime % interval) < duration;
} 