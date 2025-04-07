const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const express = require("express");
const app = express();
// Store connected users and rooms
const users = [];
const rooms = [];
const messages = [];

// Create Socket.io server
const io = new Server({
  corsOption: {
    origin: ["http://localhost:3000","https://chatapp3-tau.vercel.app","https://chatmoke.netlify.app"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors(Server.corsOption));


app.get('/',(req,res)=>{res.send({activeStatus:true,error:false})});
// Socket.io event handlers
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Get rooms list
  socket.on("rooms:list", () => {
    const roomsWithUserCount = rooms.map((room) => ({
      ...room,
      users: users.filter((user) => user.roomId === room.id).length,
    }));
    socket.emit("rooms:update", roomsWithUserCount);
  });

  // Create a new room
  socket.on("room:create", ({ name, createdBy }) => {
    const roomId = uuidv4();
    const newRoom = { id: roomId, name, createdBy };
    rooms.push(newRoom);

    // Update rooms list for all clients
    const roomsWithUserCount = rooms.map((room) => ({
      ...room,
      users: users.filter((user) => user.roomId === room.id).length,
    }));
    io.emit("rooms:update", roomsWithUserCount);
  });

  // Join a room
  socket.on("room:join", ({ roomId, username }) => {
    // Find the room
    const room = rooms.find((r) => r.id === roomId);
    if (!room) {
      socket.emit("room:error", "Room not found");
      return;
    }

    // Add user to the room
    const existingUserIndex = users.findIndex((u) => u.id === socket.id);
    if (existingUserIndex !== -1) {
      // Update existing user
      users[existingUserIndex].roomId = roomId;
    } else {
      // Add new user
      users.push({ id: socket.id, username, roomId });
    }

    // Join the socket room
    socket.join(roomId);

    // Send room data to the client
    socket.emit("room:joined", room);

    // Send room users to all clients in the room
    const roomUsers = users.filter((u) => u.roomId === roomId);
    io.to(roomId).emit("room:users", roomUsers);

    // Send message history to the client
    const roomMessages = messages.filter((m) => m.roomId === roomId);
    socket.emit("room:history", roomMessages);

    // Broadcast join message
    const joinMessage = {
      id: uuidv4(),
      roomId,
      user: "System",
      text: `${username} has joined the room`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    messages.push(joinMessage);
    socket.to(roomId).emit("message:new", joinMessage);

    // Update rooms list for all clients
    const roomsWithUserCount = rooms.map((room) => ({
      ...room,
      users: users.filter((user) => user.roomId === room.id).length,
    }));
    io.emit("rooms:update", roomsWithUserCount);
  });

  // Leave a room
  socket.on("room:leave", ({ roomId }) => {
    const userIndex = users.findIndex((u) => u.id === socket.id);
    if (userIndex !== -1) {
      const user = users[userIndex];

      // Leave the socket room
      socket.leave(roomId);

      // Broadcast leave message
      const leaveMessage = {
        id: uuidv4(),
        roomId,
        user: "System",
        text: `${user.username} has left the room`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      messages.push(leaveMessage);
      io.to(roomId).emit("message:new", leaveMessage);

      // Remove room from user
      users[userIndex].roomId = undefined;

      // Send updated user list to room
      const roomUsers = users.filter((u) => u.roomId === roomId);
      io.to(roomId).emit("room:users", roomUsers);

      // Update rooms list for all clients
      const roomsWithUserCount = rooms.map((room) => ({
        ...room,
        users: users.filter((user) => user.roomId === room.id).length,
      }));
      io.emit("rooms:update", roomsWithUserCount);
    }
  });

  // Send a message
  socket.on("message:send", (message) => {
    messages.push(message);
    socket.to(message.roomId).emit("message:new", message);
  });

  // User typing
  socket.on("user:typing", ({ roomId, username }) => {
    socket.to(roomId).emit("user:typing", username);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    const userIndex = users.findIndex((u) => u.id === socket.id);
    if (userIndex !== -1) {
      const user = users[userIndex];
      const roomId = user.roomId;

      if (roomId) {
        // Broadcast leave message
        const leaveMessage = {
          id: uuidv4(),
          roomId,
          user: "System",
          text: `${user.username} has disconnected`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        messages.push(leaveMessage);
        io.to(roomId).emit("message:new", leaveMessage);

        // Send updated user list to room
        users.splice(userIndex, 1);
        const roomUsers = users.filter((u) => u.roomId === roomId);
        io.to(roomId).emit("room:users", roomUsers);
      } else {
        users.splice(userIndex, 1);
      }

      // Update rooms list for all clients
      const roomsWithUserCount = rooms.map((room) => ({
        ...room,
        users: users.filter((user) => user.roomId === room.id).length,
      }));
      io.emit("rooms:update", roomsWithUserCount);
    }
  });
});

// Start the server on port 3001
io.listen(3001);
console.log("Socket.io server listening on port 3001");