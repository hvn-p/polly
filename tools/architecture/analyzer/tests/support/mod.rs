//! A small workspace written to a temporary directory: the valid baseline every rule test
//! breaks in one place.

#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};

pub struct Tree {
    pub root: PathBuf,
}

impl Drop for Tree {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

static NEXT: AtomicU32 = AtomicU32::new(0);

impl Tree {
    pub fn empty() -> Self {
        let root = std::env::temp_dir().join(format!(
            "architecture-analyzer-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        Self {
            root: root.canonicalize().unwrap(),
        }
    }

    pub fn write(&self, path: &str, content: &str) -> &Self {
        let file = self.root.join(path);
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(file, content).unwrap();
        self
    }

    pub fn remove(&self, path: &str) {
        std::fs::remove_file(self.root.join(path)).unwrap();
    }

    pub fn path(&self) -> &Path {
        &self.root
    }

    /// Apps import a flow through the back's index; flows chain domains; one capacity
    /// package; the kernel; a run-only package.
    pub fn valid() -> Self {
        let tree = Self::empty();
        tree.write("pnpm-workspace.yaml", "packages:\n  - apps/*\n  - 'packages/*'\n# a comment\nother: 1\n")
            .write("package.json", r#"{ "name": "fixture", "devDependencies": { "typescript": "1.0.0" } }"#)
            .write("architecture.rules.json", RULES)
            .write("node_modules/kysely/package.json", r#"{ "name": "kysely", "main": "index.js" }"#)
            .write("node_modules/kysely/index.js", "export const Kysely = 1\n")
            .write("node_modules/pg/package.json", r#"{ "name": "pg", "main": "index.js" }"#)
            .write("node_modules/pg/index.js", "export default 1\n")
            .write(
                "apps/api/package.json",
                r#"{ "name": "@t/api", "dependencies": { "@t/back": "workspace:*", "@t/database": "workspace:*", "@t/kernel": "workspace:*" } }"#,
            )
            .write(
                "apps/api/src/main.ts",
                "import { connect } from '@t/database'\nimport { startLesson } from '@t/back'\nimport { serve } from './routes.ts'\nserve(startLesson(connect()))\n",
            )
            .write(
                "apps/api/src/routes.ts",
                "import type { EventCodes } from '@t/back/domains'\nimport { type Code } from '@t/kernel'\nexport function serve(x: unknown): void {}\nexport type { EventCodes, Code }\n",
            )
            .write("apps/api/src/routes.test.ts", "import { anything } from 'not-declared'\n")
            .write(
                "packages/back/package.json",
                r#"{ "name": "@t/back", "exports": { ".": "./src/index.ts", "./domains": { "types": "./src/domains.ts", "import": "./src/domains.ts" } }, "dependencies": { "@t/kernel": "workspace:*" } }"#,
            )
            .write(
                "packages/back/src/index.ts",
                "export { startLesson } from './flows/start-lesson/index.ts'\nexport * from './flows/seed/index.ts'\n",
            )
            .write("packages/back/src/domains.ts", "export type { EventCodes } from './domains/event-codes/index.ts'\n")
            .write(
                "packages/back/src/flows/start-lesson/index.ts",
                "import type { Code } from '@t/kernel'\nimport { bind, type EventCodes } from '../../domains/event-codes/index.ts'\nexport function startLesson(store: EventCodes) { return (code: Code) => bind(store, code) }\n",
            )
            .write("packages/back/src/flows/seed/index.ts", "export function seed(): void {}\n")
            .write(
                "packages/back/src/domains/event-codes/index.ts",
                "import { hash } from '@t/kernel'\nimport { rule } from './rules.ts'\nexport interface EventCodes { save(hash: string): void }\nexport function bind(store: EventCodes, code: string) { rule(); store.save(hash(code)) }\n",
            )
            .write("packages/back/src/domains/event-codes/rules.ts", "export function rule(): void {}\n")
            .write(
                "packages/database/package.json",
                r#"{ "name": "@t/database", "exports": { ".": "./src/index.ts" }, "dependencies": { "kysely": "0.29.7", "pg": "8.0.0", "@t/back": "workspace:*" } }"#,
            )
            .write(
                "packages/database/src/index.ts",
                "import { Kysely } from 'kysely'\nimport type { EventCodes } from '@t/back/domains'\nexport function connect(): EventCodes { return { save() { void Kysely } } }\n",
            )
            .write("packages/kernel/package.json", r#"{ "name": "@t/kernel", "exports": { ".": "./src/index.ts" } }"#)
            .write(
                "packages/kernel/src/index.ts",
                "import { createHash } from 'node:crypto'\nexport type Code = string\nexport function hash(code: string): string { return createHash('sha256').update(code).digest('hex') }\n",
            )
            .write(
                "packages/migrations/package.json",
                r#"{ "name": "@t/migrations", "exports": { ".": "./src/index.ts" } }"#,
            )
            .write("packages/migrations/src/index.ts", "export const migrations = []\n");
        tree
    }
}

pub const RULES: &str = r#"{
  "ignore": ["**/*.test.ts", "**/test/**"],
  "tiers": [
    {
      "id": "interfaces", "group": "back", "name": "Routes", "criterion": "One process each.",
      "paths": ["apps/*/src"],
      "mayImport": ["flows", { "tier": "domains", "typesOnly": true }, { "tier": "adapters", "onlyFrom": ["apps/*/src/main.ts"] }, "kernel"],
      "isolated": "Two processes never import each other.",
      "fix": "Only main.ts imports an adapter."
    },
    {
      "id": "flows", "group": "back", "name": "Flows", "criterion": "One use case each.",
      "paths": ["packages/back/src/flows/*"],
      "mayImport": ["domains", { "tier": "kernel", "typesOnly": true }],
      "isolated": "Two flows never import each other: compose them in the process.",
      "technologies": [],
      "fix": "A flow chains domains.",
      "typesFix": "A flow imports only types from the kernel."
    },
    {
      "id": "domains", "group": "back", "name": "Domains", "criterion": "Product rules.",
      "paths": ["packages/back/src/domains/*"],
      "mayImport": ["kernel"],
      "isolated": "Two domains never import each other: declare a port.",
      "technologies": [],
      "fix": "A domain imports only the kernel.",
      "technologyFix": "A domain knows no technology: declare a port."
    },
    {
      "id": "adapters", "group": "back", "name": "Adapters", "criterion": "One package per capacity.",
      "paths": ["packages/database", "packages/identity", "packages/migrations"],
      "mayImport": ["adapters", { "tier": "domains", "typesOnly": true }, "kernel"],
      "fix": "An adapter implements ports."
    },
    {
      "id": "kernel", "group": "back", "name": "Kernel", "criterion": "Values.",
      "paths": ["packages/kernel"],
      "mayImport": [],
      "technologies": ["node:crypto"],
      "fix": "The kernel imports nothing of the project.",
      "technologyFix": "The kernel uses node:crypto only."
    }
  ],
  "packages": {
    "@t/database": { "provides": "storage", "technologies": ["kysely"] },
    "@t/migrations": { "provides": "migrations", "runOnly": "@t/migrations is run, never imported." }
  },
  "root": { "dependencies": ["typescript"], "fix": "The root holds only the project's tools." }
}"#;
