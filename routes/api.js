const express = require('express');
const router = express.Router();
const QuserInfo = require('../models/QuserInfo');
const QuizData = require('../models/QuizData');
const Result = require('../models/Result');
const QuizAnswers = require('../models/QuizAnswers');

// Gemini API configuration
const API_KEY = "AIzaSyBXsYmowCTRUEg9oGyXixLB91WIjO6T9r0"; // Replace with your actual API key
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

// Helper function to generate unique IDs
const generateID = (prefix) => {
  return `${prefix}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
};

// Helper function to format conversation history
const formatConversation = (conversation) => {
  return conversation
    .map((entry, index) => {
      const responseTimeInfo = entry.responseTime ? ` (Response Time: ${entry.responseTime}s)` : '';
      return `Q${index + 1}: ${entry.question}\nA${index + 1}: ${entry.answer}${responseTimeInfo}`;
    })
    .join('\n');
};

// Helper function to clean Gemini API response
const cleanResponse = (text) => {
  return text.replace(/```json|```/g, '').replace(/\n/g, ' ').trim();
};

// Input validation middleware
const validateInterviewInput = (req, res, next) => {
  const { type, experience, conversation } = req.body;
  const validTypes = ['Technical', 'HR', 'Behavioral'];
  const validExperienceLevels = ['Fresher', 'Experienced', 'Senior'];

  if (req.path.includes('generate-interview') || req.path.includes('process-answer')) {
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid or missing interview type. Must be Technical, HR, or Behavioral.' });
    }
    if (!experience || !validExperienceLevels.includes(experience)) {
      return res.status(400).json({ error: 'Invalid or missing experience level. Must be Fresher, Experienced, or Senior.' });
    }
  }

  if (req.path.includes('process-answer') || req.path.includes('evaluate-answers')) {
    if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
      return res.status(400).json({ error: 'Invalid or missing conversation array.' });
    }
    for (const entry of conversation) {
      if (!entry.question && !entry.answer) {
        return res.status(400).json({ error: 'Conversation entries must include question or answer.' });
      }
      if (entry.responseTime && (typeof entry.responseTime !== 'number' || entry.responseTime < 0)) {
        return res.status(400).json({ error: 'Invalid responseTime in conversation entry.' });
      }
    }
  }

  next();
};

// 🔹 **1️⃣ Generate First Interview Question**
router.post('/generate-interview', validateInterviewInput, async (req, res) => {
  const { type, experience } = req.body;

  try {
    const prompt = `Generate a unique first interview question for a B.Tech student for a ${type} interview at ${experience} level. Ensure the question is relevant, challenging, and tailored to the specified type and experience. Response format:
{
  "question": "Your question here"
}`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API Error: ${response.status} - ${errorText}`);
      return res.status(500).json({ error: `Failed to generate question: ${errorText}` });
    }

    const data = await response.json();
    let rawResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    rawResponse = cleanResponse(rawResponse);

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawResponse);
    } catch (parseError) {
      console.error('Failed to parse Gemini API response:', parseError.message, 'Raw:', rawResponse);
      // Fallback: Treat as plain text question if possible
      if (rawResponse.trim()) {
        parsedResponse = { question: rawResponse.trim() };
      } else {
        return res.status(500).json({ error: 'Invalid response from Gemini API' });
      }
    }

    if (!parsedResponse.question) {
      console.error('No valid question in parsed response:', parsedResponse);
      return res.status(500).json({ error: 'Failed to generate a valid question' });
    }

    res.json({ question: parsedResponse.question });
  } catch (err) {
    console.error('Error in /generate-interview:', err.message);
    res.status(500).json({ error: `Internal Server Error: ${err.message}` });
  }
});

// 🔹 **2️⃣ Process User Answer and Generate Next Question**
router.post('/process-answer', validateInterviewInput, async (req, res) => {
  const { conversation, type, experience } = req.body;

  try {
    const formattedQA = formatConversation(conversation);
    const prompt = `You are conducting a ${type} mock interview for a B.Tech student at ${experience} level. Analyze the following conversation and generate the next relevant and tailored interview question. Ensure the question builds on the previous context and matches the specified type and experience level. Response format:
{
  "question": "Your next question here"
}
Conversation:
${formattedQA}`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API Error: ${response.status} - ${errorText}`);
      return res.status(500).json({ error: `Failed to generate next question: ${errorText}` });
    }

    const data = await response.json();
    let rawResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    rawResponse = cleanResponse(rawResponse);

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawResponse);
    } catch (parseError) {
      console.error('Failed to parse Gemini API response:', parseError.message, 'Raw:', rawResponse);
      return res.status(500).json({ error: 'Invalid response from Gemini API' });
    }

    if (!parsedResponse.question) {
      console.error('No valid question in parsed response:', parsedResponse);
      return res.status(500).json({ error: 'Failed to generate a valid next question' });
    }

    res.json({ question: parsedResponse.question });
  } catch (err) {
    console.error('Error in /process-answer:', err.message);
    res.status(500).json({ error: `Internal Server Error: ${err.message}` });
  }
});

// 🔹 **3️⃣ Evaluate Final Responses**
router.post('/evaluate-answers', validateInterviewInput, async (req, res) => {
  const { conversation, type, experience } = req.body;

  try {
    const formattedQA = formatConversation(conversation);
    const prompt = `You are an expert interview evaluator for a ${type} mock interview of a B.Tech student at ${experience} level. Analyze the following conversation and provide a detailed assessment of the candidate's performance. Evaluate their answers based on clarity, technical accuracy (for Technical interviews), confidence, relevance, and response time. Provide feedback in the following JSON format:
{
  "score": "x/100",
  "strengths": "Detailed strengths observed in the answers",
  "areasToImprove": "Specific areas where the candidate can improve",
  "avgResponseTime": "Average response time in seconds"
}
Conversation:
${formattedQA}`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API Error: ${response.status} - ${errorText}`);
      return res.status(500).json({ error: `Failed to evaluate answers: ${errorText}` });
    }

    const data = await response.json();
    let rawResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    rawResponse = cleanResponse(rawResponse);

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawResponse);
    } catch (parseError) {
      console.error('Failed to parse Gemini API response:', parseError.message, 'Raw:', rawResponse);
      return res.status(500).json({ error: 'Invalid response from Gemini API' });
    }

    // Validate feedback structure
    if (
      !parsedResponse.score ||
      !parsedResponse.strengths ||
      !parsedResponse.areasToImprove ||
      parsedResponse.avgResponseTime === undefined
    ) {
      console.error('Invalid feedback format in parsed response:', parsedResponse);
      return res.status(500).json({ error: 'Invalid feedback format from Gemini API' });
    }

    // Calculate average response time as fallback if Gemini API fails to provide it
    const responseTimes = conversation
      .filter((entry) => entry.responseTime !== undefined)
      .map((entry) => entry.responseTime);
    const calculatedAvgResponseTime =
      responseTimes.length > 0 ? (responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length).toFixed(2) : 'N/A';

    res.json({
      score: parsedResponse.score,
      strengths: parsedResponse.strengths,
      areasToImprove: parsedResponse.areasToImprove,
      avgResponseTime: parsedResponse.avgResponseTime || calculatedAvgResponseTime,
    });
  } catch (err) {
    console.error('Error in /evaluate-answers:', err.message);
    res.status(500).json({ error: `Internal Server Error: ${err.message}` });
  }
});
// Other endpoints (unchanged, assumed working)
router.post('/login', async (req, res) => {
  const { email, profileUrl, name } = req.body;

  try {
    let user = await QuserInfo.findOne({ email });
    if (user) {
      return res.json({
        message: "Login successfully",
        userPoints: user.points,
      });
    }

    user = new QuserInfo({
      email,
      name,
      profile_url: profileUrl,
      points: 0,
    });
    await user.save();

    res.json({
      message: "Login successfully, new user created",
      userPoints: user.points,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate-test', async (req, res) => {
  const { subjectName, difficulty, numberOfQuestions } = req.body;

  try {
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

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const rawResponse = cleanResponse(data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
    const generatedQuestions = JSON.parse(rawResponse);

    if (!generatedQuestions.questions || !Array.isArray(generatedQuestions.questions)) {
      throw new Error("Invalid response format from Gemini API");
    }

    const quizQuestions = generatedQuestions.questions.map((q) => ({
      questionID: q.index,
      Questions: q.question,
      Options: q.options,
    }));

    const quizID = generateID("QZ");
    const quiz = new QuizData({
      quizID,
      datetime: new Date(),
      difficulty_level: difficulty,
      number_of_questions: numberOfQuestions,
      subject_name: subjectName,
      questions: quizQuestions,
    });
    await quiz.save();

    const quizAnswers = new QuizAnswers({
      quizID,
      answers: generatedQuestions.questions.map((q) => ({
        questionID: q.index,
        correctAnswer: q.correctAnswer,
      })),
    });
    await quizAnswers.save();

    res.json({ quizID, questions: quizQuestions });
  } catch (err) {
    console.error("Error in /generate-test:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/result', async (req, res) => {
  const { userEmail, quizID, timeTaken, userAnswers } = req.body;

  try {
    const quiz = await QuizData.findOne({ quizID });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const quizAnswers = await QuizAnswers.findOne({ quizID });
    if (!quizAnswers) return res.status(404).json({ error: "Quiz answers not found" });

    const correctAnswers = quizAnswers.answers.reduce((acc, q) => {
      acc[`q${q.questionID}`] = q.correctAnswer;
      return acc;
    }, {});

    let totalCorrectAnswers = 0;
    for (const [questionID, userAnswer] of Object.entries(userAnswers)) {
      if (userAnswer === correctAnswers[`q${questionID}`]) totalCorrectAnswers++;
    }

    const quizScore = Math.round((totalCorrectAnswers / quiz.number_of_questions) * 100);

    const result = new Result({
      resultID: generateID("RS"),
      email: userEmail,
      quizID,
      quiz_score: quizScore,
      time_taken: timeTaken,
      total_correct_answers: totalCorrectAnswers,
      subject: quiz.subject_name,
      difficulty: quiz.difficulty_level,
      quizDatetime: quiz.datetime,
    });
    await result.save();

    const user = await QuserInfo.findOne({ email: userEmail });
    if (user) {
      user.points += totalCorrectAnswers;
      await user.save();
    }

    res.json({
      resultId: result.resultID,
      noofquestions: quiz.number_of_questions,
      quizID,
      timeTaken,
      quizScore,
      totalCorrectAnswers,
      subject: quiz.subject_name,
      difficulty: quiz.difficulty_level,
      quizDatetime: quiz.datetime,
      correctAnswers,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/report-card', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await QuserInfo.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const results = await Result.find({ email });
    const quizReports = await Promise.all(
      results.map(async (result) => {
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
          difficultyLevel: quiz.difficulty_level,
        };
      })
    );

    res.json({ totalPoints: user.points, quizReports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/leaderboard', async (req, res) => {
  try {
    const users = await QuserInfo.find().sort({ points: -1 }).limit(10);
    const leaderboard = users.map((user) => ({
      userEmail: user.email,
      userName: user.name,
      profileUrl: user.profile_url,
      userPoints: user.points,
    }));
    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
