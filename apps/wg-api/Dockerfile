# wg-api — sidecar Go que gerencia peers do wg0 via wgctrl-go.
#
# Multi-stage:
# 1) builder em golang:1.22-alpine compila binário estático
# 2) runtime em alpine:3.19 com binário copiado

FROM golang:1.22-alpine AS builder
WORKDIR /src

# Sem go.sum no repo — go mod tidy resolve deps no build
COPY go.mod ./
COPY *.go ./

# CGO desabilitado pra binário estático; -ldflags strip pra reduzir tamanho
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o /out/wg-api .

FROM alpine:3.19
RUN apk add --no-cache ca-certificates wget && \
    addgroup -S wgapi && adduser -S wgapi -G wgapi
COPY --from=builder /out/wg-api /usr/local/bin/wg-api

# wg-api não precisa de root — o container `wireguard` (parent namespace)
# já tem as caps NET_ADMIN; aqui só fazemos chamadas via netlink que
# herdam as caps do namespace.
USER wgapi

EXPOSE 9999

# Healthcheck via /health (sem auth)
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:9999/health || exit 1

ENTRYPOINT ["/usr/local/bin/wg-api"]
