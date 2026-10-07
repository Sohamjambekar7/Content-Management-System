import { Table, Column, Model, DataType } from 'sequelize-typescript';

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

  // Add any other columns the same way
}