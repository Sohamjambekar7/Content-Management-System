import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { User } from "./User";
import { Category } from "./Category";

@Table
export class Post extends Model<Post> {
    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    title?: string;

    @Column({
        type: DataType.STRING,
        allowNull: false,
        unique: true
    })
    slug?: string;

    @Column({
        type: DataType.TEXT,
        allowNull: false
    })
    content?: string;

    @Column({
        type: DataType.STRING,
        allowNull: true
    })
    imageUrl?: string; // <--- For photos

    @Column({
        type: DataType.STRING,
        allowNull: true
    })
    videoUrl?: string; // <--- For videos

    @ForeignKey(() => User)
    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })
    userId?: number;

    @BelongsTo(() => User)
    user?: User;

    @ForeignKey(() => Category)
    @Column({
        type: DataType.INTEGER,
        allowNull: true
    })
    categoryId?: number;

    @BelongsTo(() => Category)
    category?: Category;
}