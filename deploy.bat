@echo off
setlocal enabledelayedexpansion

if "%~1"=="" (
    call :show_usage
    exit /b 1
)

if "%~1"=="backend-deploy" (
    call :backend_deploy
) else if "%~1"=="connect" (
    call :connect
) else (
    call :show_usage
    exit /b 1
)
exit /b 0

:show_usage
echo Usage: .\deploy.bat [command]
echo Commands:
echo   backend-deploy             Deploy backend application using WSL
echo   connect                    Connect to backend server
exit /b 0

:backend_deploy
echo Deploying backend...
wsl rsync -avz --exclude 'node_modules' --exclude '.git' --exclude '.env' -e "ssh -i /home/tomas/tomas-pc.pem" . ubuntu@ec2-34-207-39-54.compute-1.amazonaws.com:~/app
exit /b 0

:connect
ssh -i C:\Users\Tomas\.ssh\tomas-pc.pem ubuntu@ec2-34-207-39-54.compute-1.amazonaws.com
exit /b 0
