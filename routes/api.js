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
// Helper function to format conversation history
const formatConversation = (conversation) => {
    return conversation.map((entry, index) => `Q${index + 1}: ${entry.question}\nA${index + 1}: ${entry.answer}`).join('\n');
};

// Helper function to clean Gemini API response
const cleanResponse = (text) => {
    return text.replace(/```json|```/g, "").trim(); // Removes ```json and ``` from response
};

// 🔹 **1️⃣ Generate First Interview Question**
router.post('/generate-interview', async (req, res) => {
    try {
        const requestBody = {
            contents: [{
                parts: [{
                    text: `Generate a unique and different first interview question every time for a B.Tech student (HR & Technical).Response format:
{
  "question": "Your question here"
}`
                }]
            }]
        };

        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        let rawResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        rawResponse = cleanResponse(rawResponse); // Remove unwanted formatting

        const parsedResponse = JSON.parse(rawResponse);
        res.json({ question: parsedResponse.question });
    } catch (err) {
        console.error("Error in /generate-interview:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 🔹 **2️⃣ Process User Answer and Generate Next Question**
router.post('/process-answer', async (req, res) => {
    const { conversation } = req.body;

    if (!conversation || !Array.isArray(conversation)) {
        return res.status(400).json({ error: "Invalid input format" });
    }

    try {
        const formattedQA = formatConversation(conversation);
        console.log("Formatted QA Sent to API:", formattedQA);

        const requestBody = {
            contents: [{
                parts: [{
                    text: `You are taking a mock interview (HR and technical) of a B.Tech student. Analyze the following conversation and generate the next relevant interview question:
${formattedQA}
Response format:
{
  "question": "Your next question here"
}`
                }]
            }]
        };

        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok || !data?.candidates?.length) {
            console.error("Gemini API Error:", data);
            return res.status(500).json({ error: "Gemini API request failed" });
        }

        let rawResponse = data.candidates[0]?.content?.parts?.[0]?.text || "{}";
        rawResponse = cleanResponse(rawResponse);

        let parsedResponse;
        try {
            parsedResponse = JSON.parse(rawResponse);
        } catch (parseError) {
            console.error("Error parsing Gemini API response:", parseError);
            return res.status(500).json({ error: "Invalid response from AI API" });
        }

        if (!parsedResponse.question) {
            return res.status(500).json({ error: "No valid question generated" });
        }

        res.json({ question: parsedResponse.question });

    } catch (err) {
        console.error("Error in /process-answer:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 🔹 **3️⃣ Evaluate Final Responses**
router.post('/evaluate-answers', async (req, res) => {
    const { conversation } = req.body;

    if (!conversation || !Array.isArray(conversation)) {
        return res.status(400).json({ error: "Invalid input format" });
    }

    try {
        const formattedQA = formatConversation(conversation);

        const requestBody = {
            contents: [{
                parts: [{
                    text: `You are an expert interview evaluator. Analyze the following mock interview conversation and provide a detailed assessment of the candidate's performance. Evaluate their answers based on clarity, technical accuracy, confidence, and relevance. Provide feedback in the following JSON format:
${formattedQA}
Response format:
{
  "score": "x/10",
  "strengths": "...",
  "areasToImprove": "..."
}`
                }]
            }]
        };

        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        let rawResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        rawResponse = cleanResponse(rawResponse);

        const parsedResponse = JSON.parse(rawResponse);
        res.json(parsedResponse);
    } catch (err) {
        console.error("Error in /evaluate-answers:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

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
  const { subjectName, difficulty, numberOfQuestions } = req.body;

  console.log('Request Body:', req.body);

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

    // Parse the Gemini API response
    let generatedQuestions;
    try {
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

    // Map the questions to the desired format
    const quizQuestions = generatedQuestions.questions.map(q => ({
      questionID: q.index,          // Use "questionID" as per your example
      Questions: q.question,        // Use "Questions" as per your example
      Options: q.options           // Use "Options" as per your example
    }));

    // Generate a quizID
    const quizID = generateID("QZ");
    console.log('Generated Quiz ID:', quizID);

    // Save the quiz to QuizData
    const quiz = new QuizData({
      quizID,
      datetime: new Date(),
      difficulty_level: difficulty,
      number_of_questions: numberOfQuestions,
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

    // Send the response in the desired format
    console.log('Sending Response to Frontend:', { quizID, questions: quizQuestions });
    res.json({
      quizID,
      questions: quizQuestions
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
    // Find the quiz with all relevant fields
    const quiz = await QuizData.findOne({ quizID });
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    // Get correct answers from QuizAnswers collection
    const quizAnswers = await QuizAnswers.findOne({ quizID });
    if (!quizAnswers) {
      return res.status(404).json({ error: "Quiz answers not found" });
    }

    // Create correct answers object in key-value format (q1: answer, q2: answer)
    const correctAnswers = quizAnswers.answers.reduce((acc, q) => {
      acc[`q${q.questionID}`] = q.correctAnswer;
      return acc;
    }, {});

    // Calculate the score
    let totalCorrectAnswers = 0;
    for (const [questionID, userAnswer] of Object.entries(userAnswers)) {
      if (userAnswer === correctAnswers[`q${questionID}`]) {
        totalCorrectAnswers++;
      }
    }

    const quizScore = Math.round((totalCorrectAnswers / quiz.number_of_questions) * 100);

    // Save the result with QuizData fields
    const result = new Result({
      resultID: generateID("RS"),
      email: userEmail,
      quizID,
      quiz_score: quizScore,
      time_taken: timeTaken,
      total_correct_answers: totalCorrectAnswers,
      subject: quiz.subject_name,
      difficulty: quiz.difficulty_level,
      quizDatetime: quiz.datetime
    });
    await result.save();

    // Update user points
    const user = await QuserInfo.findOne({ email: userEmail });
    if (user) {
      user.points += totalCorrectAnswers;
      await user.save();
    }

    // Return response with correct answers in key-value format
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
      correctAnswers: correctAnswers // Added correct answers in key-value format
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
