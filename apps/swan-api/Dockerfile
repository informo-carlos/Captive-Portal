# swan-api — sidecar Go que gerencia conexões IPsec via swanctl CLI.
#
# Multi-stage:
# 1) builder em golang:1.22-alpine compila binário estático
# 2) runtime baseado em strongx509/strongswan (já tem swanctl CLI + daemon)

FROM golang:1.22-alpine AS builder
WORKDIR /src
RUN apk add --no-cache git

COPY go.mod ./
COPY *.go ./

RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o /out/swan-api .

# Imagem final: usa a mesma imagem do strongSwan pra ter swanctl + libs
# (vamos rodar swan-api no namespace do container strongswan, então
# precisa da CLI swanctl). Alternativa seria copiar swanctl pra alpine
# mas exigiria todas as libs — fica mais limpo reusar a imagem oficial.
FROM strongx509/strongswan:6.0.0
COPY --from=builder /out/swan-api /usr/local/bin/swan-api

# Pacotes mínimos pra healthcheck (wget já vem na strongx509 image)
EXPOSE 9999
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:9999/health || exit 1

ENTRYPOINT ["/usr/local/bin/swan-api"]
