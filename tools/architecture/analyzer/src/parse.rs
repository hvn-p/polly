//! What one file imports and exports, read with oxc.

use std::collections::BTreeSet;
use std::path::Path;

use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::{SourceType, Span};
use oxc_syntax::module_record::{
    ExportExportName, ExportImportName, ImportImportName, ModuleRecord, RequestedModule,
};

/// One import or re-export statement, or a dynamic import of a literal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Request {
    /// The specifier as written.
    pub spec: String,
    /// Its line, from 1.
    pub line: u32,
    /// The names it takes from the target; `*` for all.
    pub names: BTreeSet<String>,
    /// Whether it carries types only.
    pub type_only: bool,
    /// The names among `names` taken as types only.
    pub type_names: BTreeSet<String>,
    /// For a re-export: (name in the target, name exported here); `*` for all.
    pub reexports: Vec<(String, String)>,
}

/// What a file imports and exports.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Parsed {
    /// Its imports and re-exports, in order.
    pub requests: Vec<Request>,
    /// The names it exports from its own declarations.
    pub exports: BTreeSet<String>,
}

fn line_of(source: &str, span: Span) -> u32 {
    let before = source.get(..span.start as usize).unwrap_or(source);
    u32::try_from(before.matches('\n').count() + 1).unwrap_or(u32::MAX)
}

/// One import or re-export statement.
fn static_request(
    module: &ModuleRecord,
    source: &str,
    spec: &str,
    statement: &RequestedModule,
) -> Request {
    let span = statement.statement_span;
    let mut request = Request {
        spec: spec.to_string(),
        line: line_of(source, span),
        names: BTreeSet::new(),
        type_only: statement.is_type,
        type_names: BTreeSet::new(),
        reexports: vec![],
    };
    if statement.is_import {
        let entries: Vec<_> = module
            .import_entries
            .iter()
            .filter(|e| e.statement_span == span)
            .collect();
        for entry in &entries {
            let name = match &entry.import_name {
                ImportImportName::Name(name) => name.name.to_string(),
                ImportImportName::NamespaceObject => "*".to_string(),
                ImportImportName::Default(_) => "default".to_string(),
            };
            if entry.is_type || statement.is_type {
                request.type_names.insert(name.clone());
            }
            request.names.insert(name);
        }
        request.type_only |= !entries.is_empty() && entries.iter().all(|e| e.is_type);
    } else {
        let entries: Vec<_> = module
            .indirect_export_entries
            .iter()
            .chain(module.star_export_entries.iter())
            .filter(|e| e.statement_span == span)
            .collect();
        for entry in &entries {
            let imported = match &entry.import_name {
                ExportImportName::Name(name) => name.name.to_string(),
                _ => "*".to_string(),
            };
            let exported = match &entry.export_name {
                ExportExportName::Name(name) => name.name.to_string(),
                ExportExportName::Default(_) => "default".to_string(),
                ExportExportName::Null => "*".to_string(),
            };
            if entry.is_type || statement.is_type {
                request.type_names.insert(imported.clone());
            }
            request.names.insert(imported.clone());
            request.reexports.push((imported, exported));
        }
        request.type_only |= !entries.is_empty() && entries.iter().all(|e| e.is_type);
    }
    if request.names.is_empty() {
        request.names.insert("*".to_string());
    }
    request
}

/// Reads one file's imports and exports.
#[must_use]
pub fn parse(path: &Path, source: &str) -> Parsed {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(path).unwrap_or_default();
    let module = Parser::new(&allocator, source, source_type)
        .parse()
        .module_record;
    let mut requests = vec![];
    for (spec, statements) in &module.requested_modules {
        for statement in statements {
            requests.push(static_request(&module, source, spec, statement));
        }
    }
    for dynamic in &module.dynamic_imports {
        let text = dynamic.module_request.source_text(source);
        let quoted = text.len() >= 2
            && (text.starts_with('\'') || text.starts_with('"'))
            && text.ends_with(&text[..1]);
        if quoted {
            requests.push(Request {
                spec: text[1..text.len() - 1].to_string(),
                line: line_of(source, dynamic.span),
                names: BTreeSet::from(["*".to_string()]),
                type_only: false,
                type_names: BTreeSet::new(),
                reexports: vec![],
            });
        }
    }
    requests.sort_by(|a, b| (a.line, &a.spec).cmp(&(b.line, &b.spec)));
    let exports = module
        .local_export_entries
        .iter()
        .map(|e| match &e.export_name {
            ExportExportName::Name(name) => name.name.to_string(),
            _ => "default".to_string(),
        })
        .collect();
    Parsed { requests, exports }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(source: &str) -> Parsed {
        parse(Path::new("x.ts"), source)
    }

    #[test]
    fn reads_names_kinds_and_lines() {
        let p = parsed(
            "import a, { b as c, type d } from './a.ts'\nimport type { e } from './e.ts'\nimport { type f } from './f.ts'\nimport './side.ts'\nimport * as ns from './ns.ts'\nconst x = await import('./lazy.ts')\nconst y = await import(name)\nexport const z = 1\nexport default x\n",
        );
        let r = |spec: &str| p.requests.iter().find(|r| r.spec == spec).unwrap();
        assert_eq!(
            r("./a.ts").names,
            BTreeSet::from(["default".into(), "b".into(), "d".into()])
        );
        assert!(!r("./a.ts").type_only);
        assert!(r("./e.ts").type_only && r("./f.ts").type_only);
        assert_eq!(r("./side.ts").names, BTreeSet::from(["*".into()]));
        assert_eq!(r("./ns.ts").names, BTreeSet::from(["*".into()]));
        assert_eq!(r("./lazy.ts").line, 6);
        assert_eq!(p.requests.len(), 6);
        assert_eq!(p.exports, BTreeSet::from(["z".into(), "default".into()]));
    }

    #[test]
    fn reads_reexports() {
        let p = parsed(
            "export { a as b, type c } from './a.ts'\nexport * from './all.ts'\nexport * as ns from './ns.ts'\nexport type { t } from './t.ts'\n",
        );
        let r = |spec: &str| p.requests.iter().find(|r| r.spec == spec).unwrap();
        assert_eq!(
            r("./a.ts").reexports,
            vec![("a".into(), "b".into()), ("c".into(), "c".into())]
        );
        assert!(!r("./a.ts").type_only);
        assert_eq!(r("./all.ts").reexports, vec![("*".into(), "*".into())]);
        assert_eq!(r("./ns.ts").reexports, vec![("*".into(), "ns".into())]);
        assert!(r("./t.ts").type_only);
    }
}
