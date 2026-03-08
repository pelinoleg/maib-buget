#!/bin/bash

cd "$(dirname "$0")"

# Kill previous instances
echo "Oprire procese vechi..."
pkill -f "uvicorn main:app" 2>/dev/null
pkill -f "vite.*--port 5173" 2>/dev/null
sleep 1

# Start backend
echo "Pornire backend (port 8000)..."
cd backend
uvicorn main:app --port 8000 --host 0.0.0.0 &
BACKEND_PID=$!
cd ..

# Start frontend
echo "Pornire frontend (port 5173)..."
cd frontend
npm run dev -- --port 5173 &
FRONTEND_PID=$!
cd ..

echo ""
echo "==============================="
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo "==============================="
echo ""
echo "Ctrl+C pentru oprire."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
