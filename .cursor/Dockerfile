# syntax=docker/dockerfile:1.7

FROM ubuntu:24.04

ARG TARGETARCH
ARG NODE_VERSION=24.14.1
ARG GO_VERSION=1.26.4
ARG DOCKER_VERSION=28.5.2
ARG DOCKER_COMPOSE_VERSION=v5.1.3
ARG AWS_CLI_VERSION=2.34.50
ARG GOLANGCI_LINT_VERSION=v2.11.4
ARG MATTERMOST_IMAGE=mattermost/mattermost-enterprise-edition
ARG MATTERMOST_IMAGE_TAG=11.7.6
ARG MATTERMOST_IMAGE_ARCH=amd64
ARG POSTGRES_IMAGE=postgres
ARG POSTGRES_IMAGE_TAG=14

ENV DEBIAN_FRONTEND=noninteractive \
    MATTERMOST_IMAGE=${MATTERMOST_IMAGE} \
    MATTERMOST_IMAGE_TAG=${MATTERMOST_IMAGE_TAG} \
    MATTERMOST_IMAGE_ARCH=${MATTERMOST_IMAGE_ARCH} \
    MATTERMOST_PLATFORM=linux/${MATTERMOST_IMAGE_ARCH} \
    POSTGRES_IMAGE=${POSTGRES_IMAGE} \
    POSTGRES_IMAGE_TAG=${POSTGRES_IMAGE_TAG} \
    PATH=/usr/local/go/bin:/usr/local/node/bin:/home/ubuntu/go/bin:/workspace/bin:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
    acl \
    bash \
    ca-certificates \
    curl \
    fonts-liberation \
    fonts-noto-color-emoji \
    fuse-overlayfs \
    git \
    iptables \
    jq \
    libasound2t64 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libopus-dev \
    libopusfile-dev \
    libpango-1.0-0 \
    libu2f-udev \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    libxss1 \
    make \
    openssh-client \
    pkg-config \
    procps \
    skopeo \
    sudo \
    unzip \
    xdg-utils \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN update-alternatives --set iptables /usr/sbin/iptables-legacy \
    && update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy \
    && mkdir -p /etc/docker \
    && printf '{\n  "storage-driver": "fuse-overlayfs"\n}\n' > /etc/docker/daemon.json

RUN set -eux; \
    arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    case "${arch}" in \
        amd64|x86_64) docker_arch="x86_64"; node_arch="x64"; go_arch="amd64"; compose_arch="x86_64"; aws_arch="x86_64"; postgres_image_arch="amd64" ;; \
        arm64|aarch64) docker_arch="aarch64"; node_arch="arm64"; go_arch="arm64"; compose_arch="aarch64"; aws_arch="aarch64"; postgres_image_arch="arm64" ;; \
        *) echo "Unsupported architecture: ${arch}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://download.docker.com/linux/static/stable/${docker_arch}/docker-${DOCKER_VERSION}.tgz" -o /tmp/docker.tgz; \
    tar -xzf /tmp/docker.tgz -C /tmp; \
    cp /tmp/docker/* /usr/local/bin/; \
    mkdir -p /usr/local/lib/docker/cli-plugins; \
    curl -fsSL "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-${compose_arch}" -o /usr/local/lib/docker/cli-plugins/docker-compose; \
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" -o /tmp/node.tar.xz; \
    mkdir -p /usr/local/node; \
    tar -xJf /tmp/node.tar.xz -C /usr/local/node --strip-components=1; \
    curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${go_arch}.tar.gz" -o /tmp/go.tar.gz; \
    tar -C /usr/local -xzf /tmp/go.tar.gz; \
    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${aws_arch}-${AWS_CLI_VERSION}.zip" -o /tmp/awscliv2.zip; \
    unzip -q /tmp/awscliv2.zip -d /tmp; \
    /tmp/aws/install --bin-dir /usr/local/bin --install-dir /usr/local/aws-cli; \
    curl -fsSL "https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh" | sh -s -- -b /usr/local/bin "${GOLANGCI_LINT_VERSION}"; \
    ln -sf /usr/local/node/bin/node /usr/local/bin/node; \
    ln -sf /usr/local/node/bin/npm /usr/local/bin/npm; \
    ln -sf /usr/local/node/bin/npx /usr/local/bin/npx; \
    ln -sf /usr/local/go/bin/go /usr/local/bin/go; \
    ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt; \
    mkdir -p /opt/cursor-prepulled; \
    skopeo copy --retry-times 3 --override-os linux --override-arch "${MATTERMOST_IMAGE_ARCH}" "docker://${MATTERMOST_IMAGE}:${MATTERMOST_IMAGE_TAG}" "docker-archive:/opt/cursor-prepulled/mattermost-enterprise-edition.tar:${MATTERMOST_IMAGE}:${MATTERMOST_IMAGE_TAG}"; \
    skopeo copy --retry-times 3 --override-os linux --override-arch "${postgres_image_arch}" "docker://${POSTGRES_IMAGE}:${POSTGRES_IMAGE_TAG}" "docker-archive:/opt/cursor-prepulled/postgres.tar:${POSTGRES_IMAGE}:${POSTGRES_IMAGE_TAG}"; \
    rm -rf /tmp/aws /tmp/awscliv2.zip /tmp/docker /tmp/docker.tgz /tmp/node.tar.xz /tmp/go.tar.gz

RUN groupadd -f docker \
    && if ! id -u ubuntu >/dev/null 2>&1; then useradd -m -s /bin/bash -G sudo,docker ubuntu; fi \
    && usermod -aG sudo,docker ubuntu \
    && echo "ubuntu ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/ubuntu \
    && chmod 0440 /etc/sudoers.d/ubuntu \
    && printf '\nexport PATH=/usr/local/go/bin:/usr/local/node/bin:/home/ubuntu/go/bin:/workspace/bin:$PATH\n' >> /home/ubuntu/.bashrc \
    && chown ubuntu:ubuntu /home/ubuntu/.bashrc

USER ubuntu
WORKDIR /workspace

# Playwright browsers are fetched at boot via cloud-agent-install.sh when e2e/ exists.
# Computer use / screenshots use Cursor's computerUse subagent (its own Chrome desktop).
