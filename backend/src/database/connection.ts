import 'dotenv/config'; // 👈 This must be at the very top to load .env before Sequelize reads it
import 'reflect-metadata';

import { Sequelize } from "sequelize-typescript";
import { User } from "../models/User.js"; // This will work perfectly now
import { Post } from "../models/Post.js";
import { Comment } from "../models/Comment.js";
import { Category } from "../models/Category.js";
import { PostTag } from "../models/PostTag.js";
import { Tag } from "../models/Tag.js";
import { Token } from "../models/Token.js";



export const connection = new Sequelize({
    dialect: 'mysql',
    host: process.env.DB_HOST!,
    username: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!, // Tells TypeScript it's definitely a string, while staying safely fetched from .env
    database: process.env.DB_BLOG!,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    models: [User, Post, Category, Comment, PostTag, Tag, Token],
    logging: false,
});