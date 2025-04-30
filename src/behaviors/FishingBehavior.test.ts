import { isWithinWindow } from '../utils/timeUtils'; // Adjust path if needed, assuming utils is sibling to behaviors

// Define constants for testing (matching those in FishingBehavior.ts)
const HARVEST_INTERVAL_TICKS = 3600 * 60; // 1 hour (216000 ticks)
const HARVEST_DURATION_TICKS = 600 * 60;  // 10 minutes (36000 ticks)

describe('isWithinWindow', () => {
    it('should return true when time is at the start of the window (tick 0)', () => {
        expect(isWithinWindow(0, HARVEST_INTERVAL_TICKS, HARVEST_DURATION_TICKS)).toBe(true);
    });

    it('should return true when time is within the first window', () => {
        const insideFirstWindow = HARVEST_DURATION_TICKS / 2; // 18000
        expect(isWithinWindow(insideFirstWindow, HARVEST_INTERVAL_TICKS, HARVEST_DURATION_TICKS)).toBe(true);
    });

    it('should return true when time is just before the end of the first window', () => {
        const nearEndOfFirstWindow = HARVEST_DURATION_TICKS - 1; // 35999
        expect(isWithinWindow(nearEndOfFirstWindow, HARVEST_INTERVAL_TICKS, HARVEST_DURATION_TICKS)).toBe(true);
    });

    it('should return false when time is exactly at the end of the first window', () => {
        const endOfFirstWindow = HARVEST_DURATION_TICKS; // 36000
        expect(isWithinWindow(endOfFirstWindow, HARVEST_INTERVAL_TICKS, HARVEST_DURATION_TICKS)).toBe(false);
    });

    it('should return false when time is after the first window but before the second interval starts', () => {
        const afterFirstWindow = HARVEST_DURATION_TICKS + 1; // 36001
        expect(isWithinWindow(afterFirstWindow, HARVEST_INTERVAL_TICKS, HARVEST_DURATION_TICKS)).toBe(false);
        const wayAfterFirstWindow = HARVEST_INTERVAL_TICKS - 1; // 215999
        expect(isWithinWindow(wayAfterFirstWindow, HARVEST_INTERVAL_TICKS, HARVEST_DURATION_TICKS)).toBe(false);
    });

    it('should return true when time is at the start of the second window', () => {
        const startOfSecondWindow = HARVEST_INTERVAL_TICKS; // 216000
        expect(isWithinWindow(startOfSecondWindow, HARVEST_INTERVAL_TICKS, HARVEST_DURATION_TICKS)).toBe(true);
    });

    it('should return true when time is within the second window', () => {
        const insideSecondWindow = HARVEST_INTERVAL_TICKS + (HARVEST_DURATION_TICKS / 2); // 216000 + 18000
        expect(isWithinWindow(insideSecondWindow, HARVEST_INTERVAL_TICKS, HARVEST_DURATION_TICKS)).toBe(true);
    });

    it('should return false when time is exactly at the end of the second window', () => {
        const endOfSecondWindow = HARVEST_INTERVAL_TICKS + HARVEST_DURATION_TICKS; // 216000 + 36000
        expect(isWithinWindow(endOfSecondWindow, HARVEST_INTERVAL_TICKS, HARVEST_DURATION_TICKS)).toBe(false);
    });

    it('should return false for invalid configurations', () => {
        expect(isWithinWindow(100, 0, 10)).toBe(false); // Zero interval
        expect(isWithinWindow(100, 100, 0)).toBe(false); // Zero duration
        expect(isWithinWindow(100, -100, 10)).toBe(false); // Negative interval
        expect(isWithinWindow(100, 100, -10)).toBe(false); // Negative duration
        expect(isWithinWindow(100, 50, 60)).toBe(false); // Duration > Interval
    });
}); 