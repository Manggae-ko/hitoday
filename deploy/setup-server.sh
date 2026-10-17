#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 22.04/24.04 server (e.g. Naver Cloud Micro).
# Installs Docker + Compose + git, and adds 1GB of swap so builds don't run out of memory.
# Usage (as root):  bash setup-server.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "root로 실행해 주세요: sudo bash setup-server.sh" >&2
  exit 1
fi

echo "==> 패키지 설치 (Docker, Compose, git)"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2 git ca-certificates
systemctl enable --now docker

if ! swapon --show | grep -q .; then
  echo "==> 스왑 1GB 만들기 (메모리 1GB 서버에서 빌드할 때 필요)"
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> 완료"
docker --version
docker compose version
