import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.DATABASE_ID;
const PORT = process.env.PORT || 3000;

/**
 * 헬스 체크
 */
app.get("/", (req, res) => {
  res.send("ok");
});

/**
 * ✅ 카카오 지식 업로드(API 연결)용
 * - 반드시 "배열(JSON)"로 응답해야 함
 */
app.get("/kakao/knowledge", (req, res) => {
  res.status(200).json([
    {
      FAQ_No: 1,
      Category1: "온보딩",
      Category2: "카페",
      Category3: "",
      Question: "카페 가입 도와줘",
      Answer: "카페 가입하기 버튼 클릭 후 질문 작성하면 1~2일 내 승인됩니다.",
      "Landing URL": "https://cafe.naver.com/linkus16",
      "Landing URL Button Name": "카페 바로가기",
      "Image Info (URL)": ""
    }
  ]);
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
