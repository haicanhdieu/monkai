FROM alpine:3
RUN apk add --no-cache docker-cli git openssh-client
COPY watch.sh /usr/local/bin/watch
RUN chmod +x /usr/local/bin/watch
CMD ["/usr/local/bin/watch"]
