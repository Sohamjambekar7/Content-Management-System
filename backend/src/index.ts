import dotenv from 'dotenv';
dotenv.config();


import express from "express";

import './database/index.js';
import categoryRoutes from './routes/category.routes.js'

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.use('/api/categories',categoryRoutes)

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});