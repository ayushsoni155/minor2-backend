const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  resultID: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  quizID: { type: String, required: true },
  quiz_score: { type: Number, required: true },
  time_taken: { type: Number, required: true },
  total_correct_answers: { type: Number, required: true },
  subject: { type: String, required: true },
  difficulty: { type: String, required: true },
  quizDatetime: { type: Date, required: true }
});

module.exports = mongoose.model('Result', resultSchema);
