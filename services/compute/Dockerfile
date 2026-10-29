# The compute service's image: its locked environment, synced by uv inside the
# build, so the machine needs no Python and no uv.
FROM ghcr.io/astral-sh/uv:0.13.5@sha256:32a7bb39b496babbd997b0a39a4d66c126bdaf5661b302bf6f06abda8deca6ff AS uv

FROM python:3.14.10-slim@sha256:3cabfd7d7aaf394e6040e79fa1eec6ca1c52b74ed9188650472695d9a9326999
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /service
# The dependencies first, so a change to the code alone reuses their layer.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN uv sync --locked --no-dev
USER nobody
ENV POLLY_COMPUTE_HOST=0.0.0.0 POLLY_COMPUTE_PORT=8000
EXPOSE 8000
CMD ["/service/.venv/bin/python", "-m", "polly_compute"]
