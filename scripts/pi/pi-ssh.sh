#!/usr/bin/env bash
# SSH into Pi interactively
# Usage: ./pi-ssh.sh

PI_HOST="192.168.1.225"
PI_USER="pi"

ssh "$PI_USER@$PI_HOST"
