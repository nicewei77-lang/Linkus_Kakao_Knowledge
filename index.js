import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.DATABASE_ID;
const PORT = process.env.PORT || 3000;

/**
 * Notion DB 데이터를 카카오 지식 업로드 스키마로 변환
 * - 카카오 API 형식: 배열 형태 [FAQ_No, Category1~5, Question, Answer, Landing URL, Image URL]
 * - Category1~5 모두 필수 (없으면 빈 문자열)
 * - 불필요한 필드(Active, Last edited time 등) 제외
 */
function convertNotionToKakaoSchema(notionPage, index) {
  const props = notionPage.properties || {};
  
  // Notion 필드에서 값 추출 (필드명은 실제 Notion DB 구조에 맞게 수정 필요)
  const getText = (fieldName) => {
    const field = props[fieldName];
    if (!field) return "";
    if (field.rich_text && field.rich_text.length > 0) {
      return field.rich_text[0].plain_text || "";
    }
    if (field.title && field.title.length > 0) {
      return field.title[0].plain_text || "";
    }
    return "";
  };

  const getUrl = (fieldName) => {
    const field = props[fieldName];
    return field?.url || "";
  };

  // Category 필드 추출 (Category1~5)
  const category1 = getText("Category1") || getText("Category 1") || "";
  const category2 = getText("Category2") || getText("Category 2") || "";
  const category3 = getText("Category3") || getText("Category 3") || "";
  const category4 = getText("Category4") || getText("Category 4") || "";
  const category5 = getText("Category5") || getText("Category 5") || "";

  const question = getText("Question") || getText("question") || "";
  const answer = getText("Answer") || getText("answer") || "";
  const landingUrl = getUrl("Landing URL") || "";
  const imageUrl = getUrl("Image Info (URL)") || getUrl("Image URL") || "";

  // 카카오 API 형식: 배열 형태로 반환
  // 순서: FAQ_No, Category1, Category2, Category3, Category4, Category5, Question, Answer, Landing URL, Image URL
  return [
    String(index + 1), // FAQ_No (문자열로 변환)
    category1,
    category2,
    category3,
    category4, // 필수: 빈 문자열이라도 포함
    category5, // 필수: 빈 문자열이라도 포함
    question,
    answer,
    landingUrl,
    imageUrl
  ];
}

/**
 * 헬스 체크
 */
app.get("/", (req, res) => {
  res.send("OK");
});

/**
 * ✅ 카카오 지식 업로드(API 연결)용
 * - 카카오 API 형식: { values: [[...]], schema_type: "1.0" }
 * - Category1~5 모두 필수 (카카오 스키마 요구사항)
 * - Notion DB에서 데이터를 가져와 카카오 스키마로 변환
 */
app.get("/kakao/knowledge", async (req, res) => {
  try {
    let values = [];

    // Notion DB 연결이 없는 경우 임시 하드코딩 데이터 반환 (MVP용)
    if (!NOTION_TOKEN || !DATABASE_ID) {
      values = [
        [
          "1", // FAQ_No
          "온보딩", // Category1
          "카페", // Category2
          "", // Category3
          "", // Category4 (필수: 빈 문자열이라도 포함)
          "", // Category5 (필수: 빈 문자열이라도 포함)
          "카페 가입 도와줘", // Question
          "카페 가입하기 버튼 클릭 후 질문 작성하면 1~2일 내 승인됩니다.", // Answer
          "https://cafe.naver.com/linkus16", // Landing URL
          "" // Image URL
        ]
      ];
    } else {
      // Notion DB에서 데이터 조회
      const notionRes = await fetch(
        `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${NOTION_TOKEN}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ page_size: 100 }) // 최대 100개까지 조회
        }
      );

      if (!notionRes.ok) {
        console.error("Notion API error:", await notionRes.text());
        // 에러 발생 시 빈 values 반환
        values = [];
      } else {
        const notionData = await notionRes.json();
        const results = notionData?.results || [];

        // Notion 데이터를 카카오 스키마로 변환
        // Question과 Answer가 있는 것만 필터링
        values = results
          .map((page, index) => convertNotionToKakaoSchema(page, index))
          .filter(row => row[6] && row[7]); // Question(인덱스 6)과 Answer(인덱스 7)가 있는 것만
      }
    }

    // 카카오 API 형식에 맞게 응답
    return res.status(200).json({
      values: values,
      schema_type: "1.0"
    });
  } catch (error) {
    console.error("Error in /kakao/knowledge:", error);
    // 에러 발생 시 빈 values 반환
    return res.status(200).json({
      values: [],
      schema_type: "1.0"
    });
  }
});

/**
 * 카카오 챗봇 스킬용 (사용자 질문 → 노션 조회 → 답변)
 */
app.post("/knowledge", async (req, res) => {
  try {
    if (!NOTION_TOKEN || !DATABASE_ID) {
      return res.json({
        version: "2.0",
        template: {
          outputs: [
            { simpleText: { text: "서버 설정(NOTION_TOKEN / DATABASE_ID)이 비어있어요." } }
          ]
        }
      });
    }

    const notionRes = await fetch(
      `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ page_size: 5 })
      }
    );

    const data = await notionRes.json();

    const first = data?.results?.[0];
    const answer =
      first?.properties?.Answer?.rich_text?.[0]?.plain_text ||
      "관련 정보를 찾지 못했어요.";

    return res.json({
      version: "2.0",
      template: {
        outputs: [{ simpleText: { text: answer } }]
      }
    });
  } catch (error) {
    console.error(error);
    return res.json({
      version: "2.0",
      template: {
        outputs: [{ simpleText: { text: "서버 오류가 발생했어요." } }]
      }
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
