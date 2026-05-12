# swan-api — sidecar Go que gerencia conexões IPsec via swanctl CLI.
#
# Roda no mesmo network namespace que o container `strongswan` (via
# network_mode: "service:strongswan" no docker-compose), então precisa
# do mesmo binário swanctl pra falar com o daemon charon.

FROM golang:1.22-alpine AS builder
WORKDIR /src
RUN apk add --no-cache git

COPY go.mod ./
COPY *.go ./

RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o /out/swan-api .

# Runtime: Alpine + strongswan (pra ter swanctl CLI disponível)
FROM alpine:3.19
RUN apk add --no-cache strongswan wget
COPY --from=builder /out/swan-api /usr/local/bin/swan-api

EXPOSE 9999
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:9999/health || exit 1

ENTRYPOINT ["/usr/local/bin/swan-api"]
