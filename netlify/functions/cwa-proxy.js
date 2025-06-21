// netlify/functions/cwa-proxy.js
// 這是運行在 Netlify 雲端的後端程式碼，用於代理 CWA API 請求，解決 CORS 問題。

exports.handler = async (event) => {
    // 從 Netlify 的環境變數中獲取您的 CWA API 金鑰。
    // 請務必在 Netlify 專案設定中設定名為 CWA_API_KEY 的環境變數！
    const CWA_API_KEY = process.env.CWA_API_KEY;

    // 從前端請求的查詢參數中，獲取 datasetId 和所有其他參數。
    // 範例前端請求：/api/cwa-proxy?datasetId=F-C0032-001&locationName=臺北
    const { datasetId, ...otherParams } = event.queryStringParameters;

    // 檢查是否提供了 datasetId，如果沒有則返回錯誤
    if (!datasetId) {
        return {
            statusCode: 400, // Bad Request
            body: JSON.stringify({ error: "Missing datasetId in query parameters." }),
            headers: {
                "Content-Type": "application/json",
                // 允許所有來源進行 CORS 訪問，因為這是代理函數。
                "Access-Control-Allow-Origin": "*",
            },
        };
    }

    // 重建要傳遞給中央氣象署 (CWA) API 的查詢字串
    // 將所有從前端傳來的額外參數 (例如 locationName, time 等) 都加入
    const cwaQueryParams = new URLSearchParams(otherParams);
    
    // *** 移除此行：CWA API 金鑰不應該作為 URL 查詢參數。
    // cwaQueryParams.set('Authorization', CWA_API_KEY); 

    // 構建中央氣象署的完整 API URL
    const cwaApiBaseUrl = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore';
    const cwaUrl = `${cwaApiBaseUrl}/${datasetId}?${cwaQueryParams.toString()}`;

    console.log(`代理請求至 CWA API: ${cwaUrl}`); // 在控制台輸出代理請求的 URL

    try {
        // *** 關鍵修改：將 API 金鑰作為 HTTP Header 傳遞。
        // CWA API 需要 'Authorization' header，格式為 'CWA YOUR_API_KEY'
        const response = await fetch(cwaUrl, {
            headers: {
                'Authorization': `CWA ${CWA_API_KEY}` // 正確設置 Authorization Header
            }
        });
        const data = await response.json(); // 解析 CWA API 的原始回應。

        // 如果 CWA API 返回的狀態碼不是成功的 (例如 404, 500 等)，
        // 則將 CWA 的錯誤訊息和狀態碼轉發回前端。
        if (!response.ok) {
            console.error(`Error from CWA API for dataset ${datasetId}: ${response.status} - ${data.message || 'Unknown error'}`);
            return {
                statusCode: response.status, // 使用 CWA API 返回的狀態碼
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                body: JSON.stringify({
                    error: `CWA API error (${response.status}): ${data.message || 'Unknown error'}`,
                    cwa_response: data // 包含 CWA API 的原始錯誤回應，便於前端除錯
                }),
            };
        }

        // 如果成功獲取資料，則將資料回傳給前端。
        return {
            statusCode: 200, // HTTP OK
            headers: {
                "Content-Type": "application/json",
                // 允許所有來源進行 CORS 訪問，因為這是代理函數。
                "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify(data), // 將 CWA API 的 JSON 資料直接傳回
        };
    } catch (error) {
        // 捕捉在請求或解析過程中發生的任何網路或內部錯誤。
        console.error(`Proxy function caught an unexpected error for dataset ${datasetId}:`, error);
        return {
            statusCode: 500, // Internal Server Error
            body: JSON.stringify({ error: `Serverless Function Internal Error: ${error.message}` }),
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        };
    }
};
