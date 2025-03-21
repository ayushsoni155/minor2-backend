const mongoose = require('mongoose');

const quizAnswersSchema = new mongoose.Schema({
  quizID: { type: String, required: true, unique: true },
  answers: [{
    questionID: { type: Number, required: true },
    correctAnswer: { type: String, required: true }
  }]
});

module.exports = mongoose.model('QuizAnswers', quizAnswersSchema);