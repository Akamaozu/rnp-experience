#!/bin/bash

# write nginx config file
cat > /var/app/current/.platform/nginx/conf.d/https_custom.conf << LIMIT_STRING
upstream nodejs {
    server 127.0.0.1:$PORT;
    keepalive 10;
}
# HTTPS server
server {
    listen       443 default ssl;
    server_name  localhost;
    error_page 497 https://\$host\$request_uri;

    access_log    /var/log/nginx/access.log main;

    ssl_certificate      /etc/letsencrypt/live/ebcert/fullchain.pem;
    ssl_certificate_key  /etc/letsencrypt/live/ebcert/privkey.pem;
    ssl_session_timeout  5m;
    ssl_protocols  TLSv1.1 TLSv1.2;
    ssl_ciphers "EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH";
    ssl_prefer_server_ciphers   on;
    if (\$ssl_protocol = "") {
    rewrite ^ https://\$host\$request_uri? permanent;
    }
    location ~ ^/(lib/|img/) {
    root /var/app/current/public;
    }
    location / {
        proxy_pass  http://nodejs;
        proxy_set_header   Connection "";
        proxy_http_version 1.1;
        proxy_set_header        Host            \$host;
        proxy_set_header        X-Real-IP       \$remote_addr;
        proxy_set_header        X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header        Upgrade         \$http_upgrade;
        proxy_set_header        Connection      "Upgrade";
    }
}
LIMIT_STRING