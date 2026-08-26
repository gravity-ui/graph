// Builds the AI-facing docs tree (cleaned README + docs/ guides) into build/docs so an
// agent in a consumer project reads docs matching the installed version from
// node_modules/@gravity-ui/graph/build/docs. Appended to the build/build:publish package
// scripts. Uses @gravity-ui/readme-validator's buildDocs().
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {buildDocs} from '@gravity-ui/readme-validator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

buildDocs({
    rootDir: ROOT,
    outDir: path.join(ROOT, 'build', 'docs'),
    sources: [
        {
            title: 'Guides',
            kind: 'markdown',
            baseDir: 'docs',
            outPrefix: 'guides',
            nameFromTitle: true,
        },
    ],
});
