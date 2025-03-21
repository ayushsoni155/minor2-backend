const express = require('express');
const router = express.Router();
const QuserInfo = require('../models/QuserInfo');
const QuizData = require('../models/QuizData');
const Result = require('../models/Result');
const QuizAnswers = require('../models/QuizAnswers'); // New model for storing correct answers

// Gemini API configuration
const API_KEY = "AIzaSyBXsYmowCTRUEg9oGyXixLB91WIjO6T9r0"; // Replace with your actual API key
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

// Helper function to generate unique IDs
const generateID = (prefix) => {
  return `${prefix}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
};

// POST /api/login
// POST /api/login
router.post('/login', async (req, res) => {
  const { email, profileUrl, name } = req.body;

  try {
    let user = await QuserInfo.findOne({ email });
    if (user) {
      return res.json({
        message: "Login successfully",
        userPoints: user.points // Include the user's points in the response
      });
    }

    user = new QuserInfo({
      email,
      name,
      profile_url: profileUrl,
      points: 0
    });
    await user.save();

    res.json({
      message: "Login successfully, new user created",
      userPoints: user.points // Include the new user's points (0) in the response
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/generate-test
router.post('/generate-test', async (req, res) => {
  const { subjectName, difficulty, numberOfQuestions } = req.body; // Fix: Use numberOfQuestions (camelCase)

  console.log('Request Body:', req.body); // Log the incoming request body

  try {
    // Prepare the request body for the Gemini API
    const requestBody = {
      contents: [{
        parts: [{
          text: `Generate ${numberOfQuestions} multiple-choice questions on ${subjectName} with a ${difficulty} difficulty level. Provide the response in a JSON object with the following structure:  
{
  "questions": [ 
    {
      "index": 1,
      "question": "Question text here",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correctAnswer": "Correct Option"
    }
  ]
}`
        }]
      }]
    };

    console.log('Calling Gemini API...');
    // Call the Gemini API
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      console.log('Gemini API Response Status:', response.status);
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Gemini API Raw Response:', data);

    const mainResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response received";
    console.log('Gemini API Main Response:', mainResponse);

    // Parse the Gemini API response (it returns a JSON string)
    let generatedQuestions;
    try {
      // Clean up the response (remove any markdown or extra text like ```json)
      const cleanedResponse = mainResponse.replace(/```json|```/g, '').trim();
      console.log('Cleaned Response:', cleanedResponse);
      generatedQuestions = JSON.parse(cleanedResponse);
    } catch (err) {
      console.error('Parsing Error:', err.message);
      throw new Error("Failed to parse Gemini API response: " + err.message);
    }

    if (!generatedQuestions.questions || !Array.isArray(generatedQuestions.questions)) {
      console.error('Invalid Gemini API Response Format:', generatedQuestions);
      throw new Error("Invalid response format from Gemini API");
    }

    // Map the questions to the required format for QuizData
    const quizQuestions = generatedQuestions.questions.map(q => ({
      questionID: q.index,
      Questions: q.question,
      Options: q.options
    }));

    // Generate a quizID
    const quizID = generateID("QZ");
    console.log('Generated Quiz ID:', quizID);

    // Save the quiz to QuizData
    const quiz = new QuizData({
      quizID,
      datetime: new Date(),
      difficulty_level: difficulty,
      number_of_questions: numberOfQuestions, // Fix: Use numberOfQuestions (camelCase)
      subject_name: subjectName,
      questions: quizQuestions
    });
    console.log('Saving Quiz to QuizData...');
    await quiz.save();
    console.log('Quiz Saved to QuizData:', quiz);

    // Save the correct answers to QuizAnswers
    const quizAnswers = new QuizAnswers({
      quizID,
      answers: generatedQuestions.questions.map(q => ({
        questionID: q.index,
        correctAnswer: q.correctAnswer
      }))
    });
    console.log('Saving Correct Answers to QuizAnswers...');
    await quizAnswers.save();
    console.log('Correct Answers Saved to QuizAnswers:', quizAnswers);

    // Format the response for the frontend (key-value pair for questions and options)
    const responseQuestions = quizQuestions.map(q => ({
      [q.questionID]: {
        question: q.Questions,
        options: q.Options
      }
    }));

    console.log('Sending Response to Frontend:', { quizID, questions: responseQuestions });
    res.json({
      quizID,
      questions: responseQuestions
    });
  } catch (err) {
    console.error('Error in /api/generate-test:', err.message);
    res.status(500).json({ error: err.message });
  }
});
// POST /api/result
router.post('/result', async (req, res) => {
  const { userEmail, quizID, timeTaken, userAnswers } = req.body;

  try {
    // Find the quiz
    const quiz = await QuizData.findOne({ quizID });
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    // Find the correct answers
    const quizAnswers = await QuizAnswers.findOne({ quizID });
    if (!quizAnswers) {
      return res.status(404).json({ error: "Quiz answers not found" });
    }

    // Calculate the score
    let totalCorrectAnswers = 0;
    const correctAnswers = quizAnswers.answers.reduce((acc, q) => {
      acc[q.questionID] = q.correctAnswer;
      return acc;
    }, {});

    for (const [questionID, userAnswer] of Object.entries(userAnswers)) {
      if (userAnswer === correctAnswers[questionID]) {
        totalCorrectAnswers++;
      }
    }

    const quizScore = Math.round((totalCorrectAnswers / quiz.number_of_questions) * 100);

    // Save the result
    const result = new Result({
      resultID: generateID("RS"),
      email: userEmail,
      quizID,
      quiz_score: quizScore,
      time_taken: timeTaken,
      total_correct_answers: totalCorrectAnswers
    });
    await result.save();

    // Update user points
    const user = await QuserInfo.findOne({ email: userEmail });
    if (user) {
      user.points += totalCorrectAnswers; // 1 point per correct answer
      await user.save();
    }

    res.json({
      resultId: result.resultID,
      noofquestions: quiz.number_of_questions,
      quizID,
      timeTaken,
      quizScore,
      totalCorrectAnswers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/report-card
router.post('/report-card', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await QuserInfo.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const results = await Result.find({ email });
    const quizReports = await Promise.all(results.map(async (result) => {
      const quiz = await QuizData.findOne({ quizID: result.quizID });
      return {
        quizId: result.quizID,
        resultId: result.resultID,
        quizScore: result.quiz_score,
        timeTaken: result.time_taken,
        totalNoofquestions: quiz.number_of_questions,
        totalCorrectAnswers: result.total_correct_answers,
        subjectName: quiz.subject_name,
        dateTime: quiz.datetime.toISOString().replace('T', ' ').split('.')[0],
        difficultyLevel: quiz.difficulty_level
      };
    }));

    res.json({
      totalPoints: user.points,
      quizReports
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const users = await QuserInfo.find()
      .sort({ points: -1 })
      .limit(10);

    const leaderboard = users.map(user => ({
      userEmail: user.email,
      userName: user.name,
      profileUrl: user.profile_url,
      userPoints: user.points
    }));

    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
