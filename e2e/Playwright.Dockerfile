FROM mcr.microsoft.com/playwright:v1.40.1-jammy

ENV CI=1

WORKDIR /usr/src/calls-e2e
COPY . .
