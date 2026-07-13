function generateAI() {
    // 模拟生成图像，实际需替换为真实 API
    const prompt = document.getElementById('prompt - input').value;
    const imageUrl = `https://example.com/generate?prompt=${prompt}`;
    document.getElementById('generated - image').src = imageUrl;
}

function createCrowdfund(event) {
    event.preventDefault();
    const form = document.getElementById('crowdfund - form');
    const formData = {
        name: form.elements[0].value,
        target: form.elements[1].value,
        price: form.elements[2].value,
        image: form.elements[3].value
    };
    console.log(formData);
    // 实际应将数据发送到后端服务器
}