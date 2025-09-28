require('dotenv').config(); // Add this at the top
const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);


// const io = socketIo(server, {
//     cors: {
//         origin: "*", // change in production
//     },
// });

const PORT = process.env.PORT || 5000;

const corsOrigin = process.env.CORS_ORIGIN || '*';

const io = require('socket.io')(server, {
    cors: { origin: corsOrigin },
});

const waitingUsers = new Map(); // store socket.id → socket

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    socket.on('join', () => {

        const availableSockets = Array.from(waitingUsers.values()).filter(s => s.id !== socket.id);

        if (availableSockets.length > 0) {
            const partnerSocket = availableSockets.shift();
            waitingUsers.delete(partnerSocket.id);

            const roomId = uuidv4();
            socket.join(roomId);
            partnerSocket.join(roomId);

            socket.roomId = roomId;
            partnerSocket.roomId = roomId;

            socket.emit('paired', { roomId });
            partnerSocket.emit('paired', { roomId });

            console.log(`Paired ${socket.id} with ${partnerSocket.id} in room ${roomId}`);
        } else {
            // No partner yet, wait
            waitingUsers.set(socket.id, socket);
            socket.emit('waiting');
        }
    });

    socket.on('signal', ({ roomId, signalData }) => {
        socket.to(roomId).emit('signal', { signalData });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);




        if (waitingUsers.has(socket.id)) {
            waitingUsers.delete(socket.id);
        }

        // If user was in a room, notify their partner
        if (socket.roomId) {
            socket.to(socket.roomId).emit('partner-disconnected');
        }
    });
});

// Serve React build in production
app.use(express.static(path.join(__dirname, '../client/build')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

// server.listen(5000, () => {
//     console.log('Server running on port 5000');
// });

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
