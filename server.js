const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect('mongodb+srv://cesarcayaffa0:admin123@cluster0.xhaajgp.mongodb.net/myapp?retryWrites=true&w=majority', { useNewUrlParser: true, useUnifiedTopology: true });

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
});

const User = mongoose.model('User', userSchema);

// Esquema para las notas
const noteSchema = new mongoose.Schema({
  title: String,
  content: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Nuevo campo
});

// Esquema para las colecciones
const collectionSchema = new mongoose.Schema({
  name: String,
  notes: [noteSchema],
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Nuevo campo
});

const Collection = mongoose.model('Collection', collectionSchema);

app.post('/create-user', async (req, res) => {
  const { name, email, password } = req.body;

  // Hash the password before storing it in the database
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = new User({ name, email, password: hashedPassword });
  await user.save();

  // Generate a token and send it in the response
  const token = jwt.sign({ _id: user._id }, 'your_jwt_secret');
  res.header('x-auth-token', token).send('User created successfully');
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return res.status(400).send('Invalid email or password.');
  }

  // Check if the provided password is correct
  const validPassword = await bcrypt.compare(password, user.password);

  if (!validPassword) {
    return res.status(400).send('Invalid email or password.');
  }

  // Generate a token and send it in the response
  const token = jwt.sign({ _id: user._id }, 'your_jwt_secret');

  res.header('x-auth-token', token).json({ message: 'Login successful', name: user.name });
});

// Middleware para autenticar al usuario
const authenticate = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) {
    return res.status(401).send('Access denied. No token provided.');
  }

  try {
    const decoded = jwt.verify(token, 'your_jwt_secret');
    req.user = decoded;
    next();
  } catch (ex) {
    res.status(400).send('Invalid token.');
  }
};

// Ruta para crear una nueva colección
app.post('/create-collection', authenticate, async (req, res) => {
  const { name } = req.body;
  const owner = req.user._id; // Aquí asumimos que tienes el ID del usuario disponible en req.user._id
  const collection = new Collection({ name, owner });
  await collection.save();
  res.send('Collection created successfully');
});


// Ruta para agregar una nota a una colección
app.post('/add-note', authenticate, async (req, res) => {
  const { collectionId, title, content } = req.body;
  const owner = req.user._id; // Aquí asumimos que tienes el ID del usuario disponible en req.user._id
  const collection = await Collection.findById(collectionId);
  if (collection) {
    collection.notes.push({ title, content, owner });
    await collection.save();
    res.send('Note added successfully');
  } else {
    res.send('Collection not found');
  }
});

// Ruta para obtener todas las colecciones
app.get('/collections', authenticate, async (req, res) => {
  const owner = req.user._id; // Aquí asumimos que tienes el ID del usuario disponible en req.user._id
  const collections = await Collection.find({ owner });
  res.json(collections);
});

// Ruta para eliminar una colección específica
app.delete('/delete-collection/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  // Verificar si el usuario es el propietario de la colección antes de eliminarla
  const collectionToDelete = await Collection.findById(id);
  if (collectionToDelete.owner.toString() !== req.user._id) {
    return res.status(403).send('Access denied. You are not the owner of this collection.');
  }

  await Collection.findByIdAndDelete(id);
  res.send('Collection deleted successfully');
});

// Ruta para obtener las notas de una colección específica
app.get('/collections/:collectionId/notes', authenticate, async (req, res) => {
  const { collectionId } = req.params;
  const owner = req.user._id; // Aquí asumimos que tienes el ID del usuario disponible en req.user._id
  const collection = await Collection.findOne({ _id: collectionId, owner });
  if (collection) {
    res.json(collection.notes);
  } else {
    res.send('Collection not found');
  }
});

// Ruta para eliminar una nota específica de una colección
app.delete('/collections/:collectionId/notes/:noteId', authenticate, async (req, res) => {
  const { collectionId, noteId } = req.params;

  // Verificar si el usuario es el propietario de la colección antes de eliminar la nota
  const collectionToDeleteNoteFrom = await Collection.findById(collectionId);
  if (collectionToDeleteNoteFrom.owner.toString() !== req.user._id) {
    return res.status(403).send('Access denied. You are not the owner of this collection.');
  }

  const collection = await Collection.findById(collectionId);
  if (collection) {
    const noteIndex = collection.notes.findIndex(note => note._id.toString() === noteId);
    if (noteIndex !== -1) {
      collection.notes.splice(noteIndex, 1);
      await collection.save();
      res.send('Note deleted successfully');
    } else {
      res.send('Note not found');
    }
  } else {
    res.send('Collection not found');
  }
});

// Ruta para obtener los detalles de una nota específica
app.get('/notes/:noteId', authenticate, async (req, res) => {
  const { noteId } = req.params;

  // Verificar si el usuario es el propietario de la nota antes de obtener los detalles
  const noteOwner = await Collection.findOne({ "notes._id": noteId, "notes.owner": req.user._id });
  if (!noteOwner) {
    return res.status(403).send('Access denied. You are not the owner of this note.');
  }

  const collection = await Collection.findOne({ "notes._id": noteId });
  if (collection) {
    const note = collection.notes.id(noteId);
    res.json(note);
  } else {
    res.send('Note not found');
  }
});

// Ruta para actualizar una nota específica
app.put('/notes/:noteId', authenticate, async (req, res) => {
  const { noteId } = req.params;

  // Verificar si el usuario es el propietario de la nota antes de actualizarla
  const noteOwner = await Collection.findOne({ "notes._id": noteId, "notes.owner": req.user._id });
  if (!noteOwner) {
    return res.status(403).send('Access denied. You are not the owner of this note.');
  }

  const { collectionId, title, content } = req.body;
  const collection = await Collection.findOne({ "notes._id": noteId });
  if (collection) {
    const note = collection.notes.id(noteId);
    note.collectionId = collectionId;
    note.title = title;
    note.content = content;
    await collection.save();
    res.send('Note updated successfully');
  } else {
    res.send('Note not found');
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));