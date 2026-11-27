import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

// Pages can ship independently when the matching API and puzzle library are live.
function files(path) {
    return readdirSync(path, {withFileTypes: true}).flatMap(entry => {
        const name = join(path, entry.name);
        return entry.isDirectory() ? files(name) : [name];
    });
}

const hash = createHash('sha256');
for (const path of [...files('server'), 'public/game-rules.mjs', 'package.json', 'package-lock.json', 'wrangler.jsonc'].sort()) {
    hash.update(path.replaceAll('\\', '/') + '\0');
    hash.update(createHash('sha256').update(readFileSync(path)).digest());
}
console.log(hash.digest('hex').slice(0, 24));
