@echo off
set VERSION=%1
if "%VERSION%"=="" set VERSION=latest
set IMAGE=chat-web-account-service:%VERSION%

echo === Building %IMAGE% ===
docker build -t "%IMAGE%" -t chat-web-account-service:latest .

echo === Deploying to K8s ===
kubectl apply -f k8s/
kubectl set image deployment/chat-web-account-service app="%IMAGE%"
kubectl rollout status deployment/chat-web-account-service --timeout=180s

echo === Done ===
kubectl get pods -l app=chat-web-account-service
