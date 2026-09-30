TLS certificates for `NGINX_MODE=https` are mounted from here (certbot layout:
`live/<DOMAIN>/fullchain.pem`, `live/<DOMAIN>/privkey.pem`). Never commit keys —
this folder is git-ignored except this file. See backend/docs/deployment.md#tls.
