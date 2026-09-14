#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { papagaio } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    const args = process.argv.slice(2);
    
    // Help / Version
    if (args.includes('--version') || args.includes('-v')) {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
        console.log(`papagaio v${pkg.version}`);
        process.exit(0);
    }

    if (args.includes('--help') || args.includes('-h')) {
        console.log("Papagaio - JavaScript Text Processing & Pattern Engine");
        console.log("Usage: papagaio <file.txt> [key=value ...]");
        process.exit(0);
    }

    if (args.length < 1) {
        console.error("Usage: papagaio <file.txt> [key=value ...]");
        process.exit(1);
    }

    const filePath = args[0];
    if (!fs.existsSync(filePath)) {
        console.error(`Error reading file: ${filePath}`);
        process.exit(1);
    }

    const input = fs.readFileSync(filePath, 'utf-8');
    
    // Parse key=value arguments into context
    const context = {};
    for (let i = 1; i < args.length; i++) {
        const eqIdx = args[i].indexOf('=');
        if (eqIdx !== -1) {
            const key = args[i].slice(0, eqIdx);
            const val = args[i].slice(eqIdx + 1);
            context[key] = val;
        } else {
            context[`arg${i}`] = args[i];
        }
    }

    const output = papagaio(input, context);
    process.stdout.write(output);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
