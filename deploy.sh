#!/bin/bash
# Переходим в директорию проекта на Raspberry Pi
cd ~/deskhub || exit

echo "Pulling latest images..."
docker compose pull

echo "Starting containers..."
docker compose up -d

echo "Cleaning up old images..."
docker image prune -f

echo "Deploy complete!"
