import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { User } from './User.js';

@Table({
  tableName: 'Categories',
  timestamps: true
})
export class Category extends Model {

  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true
  })
  declare id: number;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  declare name: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: true
  })
  declare slug: string;

  @ForeignKey(()=>User)
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  userId?: number;

  @BelongsTo(()=>User)
  user?: User;


  // Add any other columns the same way
}