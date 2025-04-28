import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { appendFile } from 'fs/promises';

// Define the log file path
// Using a simple path for now. Could be enhanced with run IDs later.
const logFilePath = './logs/events.jsonl';

/**
 * Ensures the directory for the log file exists.
 */
function ensureLogDirectoryExists(): void {
    const logDir = dirname(logFilePath);
    if (!existsSync(logDir)) {
        try {
            mkdirSync(logDir, { recursive: true });
            console.log(`Log directory created: ${logDir}`);
        } catch (error) {
            console.error(`Failed to create log directory ${logDir}:`, error);
            // Depending on requirements, might want to throw or handle differently
        }
    }
}

// Ensure directory exists when the module is loaded
ensureLogDirectoryExists();

/**
 * Logs an event object to the JSONL file.
 * @param eventData - The event data to log (must be JSON serializable).
 */
export async function logEvent(eventData: Record<string, any>): Promise<void> {
    try {
        // Add a timestamp to every event automatically
        const eventToLog = {
            timestamp: new Date().toISOString(),
            ...eventData,
        };

        const jsonString = JSON.stringify(eventToLog);
        // Append to the file
        await appendFile(logFilePath, jsonString + '\n');
    } catch (error) {
        console.error(`Failed to write to log file ${logFilePath}:`, error);
        // Avoid crashing the server due to logging failures
    }
}

// Example basic usage (optional - for testing the logger itself)
// logEvent({ type: 'server_start', message: 'Logger initialized' }); 