import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { User } from "./User.js";

@Table
export class Token extends Model<Token> {

    @Column({
        type: DataType.STRING,
        allowNull: false,
    })
    token!: string;

    @ForeignKey(() => User)
    @Column({
        type: DataType.INTEGER, // <-- Add this explicit type definition here
        allowNull: true,       // Match your optional type (userId?: number)
    })
    userId?: number;

    @BelongsTo(() => User)
    user?: User;

    @Column({
        type: DataType.ENUM('activation', 'reset'),
    })
    type?: 'activation' | 'reset';
}