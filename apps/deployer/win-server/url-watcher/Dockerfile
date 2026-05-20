FROM alpine:3
RUN apk add --no-cache docker-cli curl jq
COPY watch.sh /usr/local/bin/watch
RUN sed -i 's/\r$//' /usr/local/bin/watch && chmod +x /usr/local/bin/watch
CMD ["/usr/local/bin/watch"]
