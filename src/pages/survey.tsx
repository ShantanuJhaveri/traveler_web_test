import { Button } from '@material-ui/core';
import * as React from 'react';
import { useState } from 'react';
import { putItem } from '../dbHelper';
import { useStateValue, Action } from '../state';
import RadioButtonGroup from '../components/RadioButtonGroup';
import RankedScale from '../components/RankedScale';
import { QuestionType, SurveyQuestion, surveyQuestions as rawSurveyQuestions, TextAreaType } from '../data/surveyQuestions';
import '../styles/survey.scss';
import { TransectType } from '../types';

const tileIndentation = 40;
type SurveyAnswers = {[key: string] : string}

const setSurveyQuestionIDs = (page: number, questionList: SurveyQuestion[], parentID = "") => {
    const pagePrefix = parentID === "" ? (page + "-") : "";
    questionList.forEach((question, i) => {
        question.id = pagePrefix + (parentID ? (parentID + ".") : "") + i.toString();
        if (question.followUps) {
            question.followUps.forEach((followUp, i) => {
                if (followUp) {
                    setSurveyQuestionIDs(page, Array.isArray(followUp) ? followUp : [followUp], question.id + "." + i);
                }
            });
        }
    });
}

const generateSurveyOutput = (answers: SurveyAnswers, questionList: SurveyQuestion[][]) => {
    const questions = [];
    const extractQuestions = (question: SurveyQuestion, questions: any[], answers: SurveyAnswers) => {
        if (question.type === QuestionType.Instruction || !answers[question.id || "-1"]) return;
        questions.push({
            id: question.id,
            text: question.text,
            type: QuestionType[question.type],
            value: answers[question.id || "-1"]
        });
        if (question.followUps) {
            question.followUps.forEach(followUp => {
                if (followUp) {
                    (Array.isArray(followUp) ? followUp : [followUp]).forEach(followUpQuestion => {
                        extractQuestions(followUpQuestion, questions, answers);
                    });
                }
            });
        }
    }
    questionList.forEach(page => {
        page.forEach(q => extractQuestions(q, questions, answers));
    });
    return questions;
}

const allQuestionsAnswered = (answers, questions: SurveyQuestion[]) : boolean => {
    for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        if (question.type === QuestionType.Instruction) continue;
        const id = question.id || "-1";
        const answer = answers[id];
        if (!answer) return false;
        if (question.followUps && question.followUps[answer]) {
            const followUpAnswered =
                Array.isArray(question.followUps[answer]) ? allQuestionsAnswered(answers, question.followUps[answer] as SurveyQuestion[]) :
                allQuestionsAnswered(answers, [question.followUps[answer] as SurveyQuestion]);
            if (!followUpAnswered) return false;
        }
    }
    return true;
}

// Hacky deep copy
const surveyQuestions: SurveyQuestion[][] = JSON.parse(JSON.stringify(rawSurveyQuestions));
surveyQuestions.forEach((page, i) => setSurveyQuestionIDs(i, page));

const instructionComponent = (question: SurveyQuestion, depth: number) => {
    const id: string = question.id || "-1";
    return (
        <div className="section" style={{marginLeft: `${depth * tileIndentation}px`}} key={id}>
            <p>{ question.text }</p>
        </div>
    );
}

const multipleChoiceComponent = (question: SurveyQuestion, setAnswer, answers: SurveyAnswers, depth: number, unanswered: boolean) => {
    if (!question.responses) return null;
    const id: string = question.id || "-1";
    return (
        <div className={`section ${unanswered && "highlighted"}`} style={{marginLeft: `${depth * tileIndentation}px`}} key={id}>
            <p>{ question.text }</p>
            <RadioButtonGroup options={question.responses} selectedIndex={Number(answers[id] || "-1")} onChange={i => setAnswer(id, i.toString())}/>
        </div>
    );
}

const rankedComponent = (question: SurveyQuestion, setAnswer, answers: SurveyAnswers, depth: number, unanswered: boolean) => {
    const id: string = question.id || "-1";
    return (
        <div className={`section ${unanswered && "highlighted"}`} style={{marginLeft: `${depth * tileIndentation}px`}} key={id}>
            <p>{ question.text }</p>
            <div className="rankedScaleContainer">
                <RankedScale onChange={v => {setAnswer(id, v.toString())}} selectedIndex={answers[id]}/>
            </div>
        </div>
    );
}

const textComponent = (question: SurveyQuestion, answers, setAnswer, depth: number, unanswered: boolean, transectString: String) => {
    const id: string = question.id || "-1";
    let inputAreaClass = "inputAreaLarge";
    let rows = 3;
    let inputMode: ("text" | "numeric") = "text"
    if (question.params) {
        if (question.params.textAreaType === TextAreaType.Small) {
            inputAreaClass = "inputAreaSmall";
            rows = 1;
        } else if (question.params.textAreaType === TextAreaType.Number) {
            inputAreaClass = "inputAreaSmall";
            rows = 1;
            inputMode = "numeric";
        }
    }

    const onTextChange = e => {
        setAnswer(id, e.target.value);
    }

    return (
        <div className={`section ${unanswered && "highlighted"}`} style={{marginLeft: `${depth * tileIndentation}px`}} key={id}>
            <p>{ question.text + transectString }</p>
            <div className={inputAreaClass}>
                {
                    inputMode === "numeric" ?
                        // Display the user's prior responses
                        answers[id] ?
                            <input type="number" onChange={onTextChange} defaultValue={answers[id]}/> :
                            <input type="number" onChange={onTextChange}/> 
                    :
                        // Display the user's prior responses
                        answers[id] ?
                            <textarea onChange={onTextChange} rows={rows} defaultValue={answers[id]}/> :
                            <textarea onChange={onTextChange} rows={rows}/>
                }
            </div>
        </div>
    );
}

const mapConclusionImage = require('../../assets/map_conclusion.png');
const surveyMap = (
    <div key="conclusion-survey-map-image">
        <p style={{marginBottom: "3vh"}}></p>
        <img src={mapConclusionImage} className="mapConclusionImage"/>
        <p style={{marginBottom: "3vh"}}></p>
    </div>
);

const buildQuestionComponents = (questionList: SurveyQuestion[], answers: SurveyAnswers, setAnswer, firstUnansweredId, transectIndices, depth = 0) => {
    let components = [] as JSX.Element[];

    questionList.forEach(question => {
        
        // For the question below, add the user's selected transects and show the map image:
        // Why did you select the particular dune transects (within the field area) that you did?
        let transectString = "";
        if (question.id === "1-1") {
            components.push(surveyMap);
            transectString += " (Transects: ";
            let transectList = transectIndices.filter(transect => transect.type !== TransectType.DISCARDED);
            transectList.forEach(transect => {
                if (transectString === " (Transects: ") {
                    transectString += (transect.number + 1).toString();
                } else {
                    transectString += ", " + (transect.number + 1).toString();
                }
            });
            transectString += ")";
        }

        const showAsUnanswered = firstUnansweredId === question.id;
        const component =
            question.type === QuestionType.Instruction ? instructionComponent(question, depth) :
            question.type === QuestionType.MultipleChoice ? multipleChoiceComponent(question, setAnswer, answers, depth, showAsUnanswered) :
            question.type === QuestionType.Ranked ? rankedComponent(question, setAnswer, answers, depth, showAsUnanswered) :
            question.type === QuestionType.Text ? textComponent(question, answers, setAnswer, depth, showAsUnanswered, transectString) :
            <></>; // Should never reach here
        components.push(component || <></>);

        if (question.followUps) {
            question.followUps.forEach((followUp, i) => {
                if (followUp && question.id && answers[question.id] === i.toString()) {
                    components = components.concat(...buildQuestionComponents(Array.isArray(followUp) ? followUp : 
                        [followUp], answers, setAnswer, firstUnansweredId, transectIndices, depth + 1));
                }
            });
        }
    });
    return components;
}

const idOfFirstUnansweredQuestion = (questionList: SurveyQuestion[], answers: SurveyAnswers): (string | null) => {
    for (let i = 0; i < questionList.length; i++) {
        const question = questionList[i];
        const answer = answers[question.id || "-1"];
        if (!question) continue;
        const questionAnswered = question.type === QuestionType.Instruction || !!answer;
        if (!questionAnswered) {
            return question.id || "-1";
        }
        if (question.followUps && answer && answer != "-1") {
            let followUps = question.followUps[Number(answer)];
            if (followUps) {
                followUps = Array.isArray(followUps) ? followUps as SurveyQuestion[] : [followUps as SurveyQuestion];
                const id = idOfFirstUnansweredQuestion(followUps, answers);
                if (id !== null) return id;
            }
        }
    };
    return null;
}

export default function Survey() {
    const [globalState, dispatch] = useStateValue();
    const { robotVersion, strategy } = globalState;
    const { transectIndices } = strategy;
    const [page, setPage] = useState(0);
    const [answers, setAnswers] = useState({} as SurveyAnswers);
    const setAnswer = (id: string, answer: string) => {
        const newAnswer = {};
        newAnswer[id] = answer;
        setAnswers({...answers, ...newAnswer});
    };
    const firstUnansweredId = idOfFirstUnansweredQuestion(surveyQuestions[page], answers);
    let questionComponents = buildQuestionComponents(surveyQuestions[page], answers, setAnswer, firstUnansweredId, transectIndices);

    const saveLogs = surveyOutput => {

        // Increment the initial strategy and actual strategy transect numbers by 1 to align
        // with the transect numbers on the map view
        let initialStrategyTemp = globalState.initialStrategyData;
        initialStrategyTemp.transects.map(transect => {
            transect.number = transect.number + 1;
            return transect;
        });
        let actualStrategyTemp = globalState.actualStrategyData;
        actualStrategyTemp.transects.map(transect => {
            transect.number = transect.number + 1;
            return transect;
        });

        const log = {
            dataVersion: globalState.dataVersion,
            initialStrategy: initialStrategyTemp,
            actualStrategy: actualStrategyTemp,
            finalHypotheses: {
                localHypothesis: globalState.finalLocalHypothesis,
                globalHypothesis: globalState.finalGlobalHypothesis
            },
            surveyResponses: surveyOutput
        };
        //putItem(JSON.stringify(log), function(error, data) {});
        putItem(JSON.stringify(log), function(err, data) {
            if (err) {
                console.log('Err', err);
            }
            console.log(data);
        });
    }

    const onContinueClick = () => {
        if (page < surveyQuestions.length - 1) {
            if (page + 1 === surveyQuestions.length - 1) {
                const output = generateSurveyOutput(answers, surveyQuestions);
                // Outputs the user's responses to the database
                if (!robotVersion) { // TEMPORARILY NOT OUTPUTTING RESULTS TO DATABASE WHEN TEMPLATE IS USED FOR INITIAL STRATEGY SELECTION
                    saveLogs(output);
                }
                // Set the "submitted" state property to true so that if the user revisits the website,
                // the user will start from the begining and will not be shown a continue progress screen
                dispatch({type: Action.SET_SUBMITTED_STATUS, value: true});
            }
            setPage(page + 1);
        }
    }

    const onBackClick = () => { if (page > 0) setPage(page - 1); }

    return (
        <div className="surveyContainer">
            { questionComponents }
            {!(page === surveyQuestions.length - 1) &&
                <div className="buttonRow">
                    <Button disabled={page === 0} className="backButton" color="primary" variant="contained" onClick={onBackClick}>Back</Button>
                    <Button disabled={!allQuestionsAnswered(answers, surveyQuestions[page])} className="continueButton" color="primary" variant="contained" onClick={onContinueClick}>Continue</Button>
                </div>
            }
        </div>
    );
}