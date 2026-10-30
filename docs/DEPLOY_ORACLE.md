# Oracle Cloud 배포 런북

HIToday 서버를 Oracle Cloud Always Free 범위의 Ampere A1 인스턴스에 올리는 절차입니다. 무료 한도와 유휴 인스턴스 회수 정책은 바뀔 수 있으므로 생성 전에 Oracle의 현재 정책을 확인하세요.

## 1. 계정과 인스턴스

1. Always Free 계정을 만들고 가까운 홈 리전을 선택합니다. 홈 리전은 나중에 바꾸기 어렵습니다.
2. Ampere A1(ARM64), Ubuntu 22.04 인스턴스를 무료 한도 안의 OCPU·메모리로 만듭니다. 용량 부족 시 같은 리전의 다른 가용 도메인을 시도합니다.
3. SSH 22번은 본인 IP에만 허용합니다. VCN 보안 목록에서 TCP 80·443을 `0.0.0.0/0`에 열고, 인스턴스의 iptables에도 80·443 허용 규칙을 추가합니다. Ubuntu 이미지의 기본 REJECT 규칙보다 앞에 허용 규칙이 있어야 합니다.

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 2. 서버 준비

SSH 접속 직후 `sudo -i`로 root 셸에 들어갑니다. 이후 이 문서의 clone, 서버 준비, Docker 실행, 자동 업데이트 명령은 모두 root 셸에서 실행합니다. `setup-server.sh`는 일반 사용자를 Docker 그룹에 추가하지 않으므로 실행 계정을 섞으면 Docker 소켓 권한과 저장소 소유권 문제가 생길 수 있습니다. 저장소는 `/root/hitoday`에 clone합니다. Docker의 `node:22-alpine` 이미지는 ARM64를 지원하므로 A1에서 그대로 빌드됩니다.

```bash
sudo -i
git clone https://github.com/Manggae-ko/hitoday.git /root/hitoday
cd /root/hitoday
bash deploy/setup-server.sh
```

## 3. DuckDNS와 Caddy

1. DuckDNS에서 서브도메인을 만들고 인스턴스 공인 IP로 갱신합니다.
2. DuckDNS 토큰은 저장소에 쓰지 말고 서버의 제한된 파일이나 cron 환경에 보관합니다.
3. 5분마다 IP를 갱신하는 cron을 등록합니다. 실제 서브도메인과 토큰은 로컬 값으로 치환합니다.

```cron
*/5 * * * * curl -fsS "https://www.duckdns.org/update?domains=<your-subdomain>&token=<your-token>&ip=" >/dev/null
```

Caddy는 `deploy/Caddyfile`에 따라 80·443에서 인증서를 자동 발급하고 relay로 프록시합니다.

## 4. 환경 설정과 실행

```bash
cd /root/hitoday/deploy
cp .env.example .env
chmod 600 .env
```

`.env`의 `DOMAIN`, `GITHUB_REPO`와 선택적 통계·알림 값을 채웁니다. 토큰, 이메일 주소, 실제 서버 주소는 커밋하지 않습니다.

```bash
docker compose up -d --build
curl https://<your-subdomain>.duckdns.org/health
```

GitHub Actions Variables에 다음 값을 설정합니다.

- `HITODAY_SERVER=wss://<your-subdomain>.duckdns.org`
- `HITODAY_DOMAIN=<your-subdomain>.duckdns.org`

## 5. 자동 업데이트

```bash
bash /root/hitoday/deploy/install-auto-update.sh
tail -f /var/log/hitoday-update.log
```

cron은 2분마다 `deploy/auto-update.sh`를 실행하고 새 커밋이 있으면 Docker 이미지를 다시 빌드합니다.

## 6. 백업과 복구

Docker의 relay 데이터 볼륨에 있는 `DATA_DIR`를 정기적으로 암호화 백업합니다. 백업 대상은 `device-keys.json`, `rooms.json`, `stats.json`, `schedules.json`입니다. `/root/hitoday/deploy`에서 다음 명령으로 백업 파일을 만든 뒤 별도 저장소에서 암호화해 보관합니다.

```bash
docker run --rm -v deploy_relay-data:/data -v "$PWD":/backup alpine tar czf /backup/hitoday-data-$(date +%F).tgz -C /data .
```

복구할 때는 컨테이너를 멈추고 백업 파일명을 실제 파일에 맞춘 뒤 같은 데이터 볼륨에 압축을 풉니다.

```bash
docker compose down
docker run --rm -v deploy_relay-data:/data -v "$PWD":/backup alpine sh -c 'rm -rf /data/* && tar xzf /backup/hitoday-data-YYYY-MM-DD.tgz -C /data'
docker compose up -d
```

Oracle은 장기간 낮은 사용률의 Always Free 인스턴스를 유휴 상태로 판단해 회수할 수 있습니다. 정책과 알림을 확인하고, 재생성에 대비해 저장 데이터와 `deploy/.env`를 별도로 백업하세요.
