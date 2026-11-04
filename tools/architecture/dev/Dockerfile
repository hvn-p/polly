# syntax=docker/dockerfile:1
# The analyzer's image for a repository's development environment, built by
# serve.ts with the analyzer's directory as its context. Two targets:
#   source: the analyzer built from that directory, and the view built from
#     its sources, given as the build context `view`;
#   package: a published version of @hvn-p/architecture, for Linux.
# Both run on the same image, which holds git and tar for the analyzer's
# comparison with the base branch.

FROM rust:1.99.1-trixie@sha256:4c4c8ec55be09785e6d6ac45ea9853525a73c15db74009100ac08952e773dfb8 AS build
WORKDIR /analyzer
# rust-toolchain.toml is left out: it names this image's version, and would
# have rustup download the components the build does not use.
COPY Cargo.toml Cargo.lock build.rs identity.mjs ./
COPY src src
# The identity of the sources, computed outside: the container holds no git
# checkout (build.rs).
ARG ANALYZER_IDENTITY=null
ENV ANALYZER_IDENTITY=${ANALYZER_IDENTITY}
# The registry and the build directory are kept between builds, so a rebuild
# only compiles what changed.
RUN --mount=type=cache,id=architecture-cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=architecture-cargo-target,target=/analyzer/target \
    cargo build --release --locked \
    && cp target/release/architecture-analyzer /architecture-analyzer

FROM node:24.22.1-trixie@sha256:f1e034976f948cf212ef1f659c12e5dd58ac7eab947831813e81a62401ca38be AS source
COPY --from=build /architecture-analyzer /usr/local/bin/architecture
COPY --from=view . /usr/local/share/architecture/view

FROM node:24.22.1-trixie@sha256:f1e034976f948cf212ef1f659c12e5dd58ac7eab947831813e81a62401ca38be AS package
ARG VERSION
RUN npm install --global --no-audit --no-fund "@hvn-p/architecture@${VERSION}" \
    && mkdir -p /usr/local/share/architecture \
    && ln -s /usr/local/lib/node_modules/@hvn-p/architecture/view /usr/local/share/architecture/view
