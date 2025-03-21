const mongoose = require('mongoose');

const quizDataSchema = new mongoose.Schema({
  quizID: { type: String, required: true, unique: true },
  datetime: { type: Date, required: true },
  difficulty_level: { type: String, required: true },
  number_of_questions: { type: Number, required: true },
  subject_name: { type: String, required: true },
  questions: [{
    questionID: { type: Number, required: true },
    Questions: { type: String, required: true },
    Options: [{ type: String, required: true }],
    correctAnswer: { type: String } // Optional: Store correct answers for scoring
  }]
});

module.exports = mongoose.model('QuizData', quizDataSchema);
