//! Path globs: `*` within one segment, `**` across any number of segments.

/// Whether a string matches a pattern where `*` stands for any characters.
#[must_use]
pub fn wildcard(pattern: &str, text: &str) -> bool {
    match pattern.split_once('*') {
        None => pattern == text,
        Some((head, tail)) => {
            let Some(rest) = text.strip_prefix(head) else {
                return false;
            };
            (0..=rest.len())
                .filter(|&i| rest.is_char_boundary(i))
                .any(|i| wildcard(tail, &rest[i..]))
        }
    }
}

/// Whether a whole path matches a glob.
#[must_use]
pub fn matches(pattern: &str, path: &str) -> bool {
    let pattern: Vec<&str> = pattern.split('/').collect();
    let path: Vec<&str> = path.split('/').collect();
    segments(&pattern, &path)
}

fn segments(pattern: &[&str], path: &[&str]) -> bool {
    match pattern.split_first() {
        None => path.is_empty(),
        Some((&"**", rest)) => (0..=path.len()).any(|i| segments(rest, &path[i..])),
        Some((first, rest)) => path
            .split_first()
            .is_some_and(|(segment, others)| wildcard(first, segment) && segments(rest, others)),
    }
}

/// The part of a path a glob matches from its start, segment by segment.
#[must_use]
pub fn prefix<'a>(pattern: &str, path: &'a str) -> Option<&'a str> {
    let count = pattern.split('/').count();
    let mut parts = path.split('/');
    let mut length = 0;
    for (index, glob) in pattern.split('/').enumerate() {
        let segment = parts.next()?;
        if !wildcard(glob, segment) {
            return None;
        }
        length += segment.len() + usize::from(index + 1 < count);
    }
    Some(&path[..length])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wildcards_match_within_a_name() {
        assert!(wildcard("node:*", "node:fs"));
        assert!(wildcard("@scope/*", "@scope/x"));
        assert!(!wildcard("node:*", "nodes"));
        assert!(wildcard("kysely", "kysely"));
    }

    #[test]
    fn globs_cross_segments_with_two_stars_only() {
        assert!(matches("**/*.test.ts", "apps/api/src/a.test.ts"));
        assert!(matches("**/test/**", "apps/api/test/support/x.ts"));
        assert!(matches("apps/*/src/main.ts", "apps/api/src/main.ts"));
        assert!(!matches("apps/*/src/main.ts", "apps/api/src/entry/main.ts"));
    }

    #[test]
    fn a_prefix_is_whole_segments() {
        assert_eq!(
            prefix("apps/*/src", "apps/api/src/entry/x.ts"),
            Some("apps/api/src")
        );
        assert_eq!(
            prefix(
                "packages/back/src/flows/*",
                "packages/back/src/flows/a/index.ts"
            ),
            Some("packages/back/src/flows/a")
        );
        assert_eq!(
            prefix("dev/src/main.ts", "dev/src/main.ts"),
            Some("dev/src/main.ts")
        );
        assert_eq!(prefix("apps/*/src", "apps/api"), None);
        assert_eq!(prefix("packages/kernel", "packages/kernels/x.ts"), None);
    }
}
